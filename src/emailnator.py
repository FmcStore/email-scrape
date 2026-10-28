#!/usr/bin/env python3
"""
Emailnator bridge — called by Node.js (src/emailnator.js) via child_process.
Uses patchright (stealth Chromium) because emailnator.com now runs Next.js
behind Cloudflare and requires a real-browser TLS fingerprint + cookies.

New API (discovered 2026-10 via UI network capture):
  POST /api/generate-email  {"ids":[1,2,3,8]}        -> {"status":"success","email":"..."}
  POST /api/message-list    {"email":..,"limit":20}  -> {"status":"success","messages":[{id,from,subject,timestamp,time_ago}]}
  GET  /api/message/{id}                             -> {"id","from","subject","time","message"/html}

Usage:
  emailnator.py create
  emailnator.py inbox <email>
  emailnator.py read <email> <messageID>
Output: JSON on stdout (single line). Errors: {"error": "..."} with exit code 1.
"""
import json
import sys
from urllib.parse import quote

BASE = 'https://www.emailnator.com'

# Reuse one browser across calls in the same process.
_browser = None
_page = None


def get_page():
    global _browser, _page
    if _page is not None:
        return _page
    from patchright.sync_api import sync_playwright

    pw = sync_playwright().start()
    _browser = pw.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'], headless=True)
    _page = _browser.new_page()
    _page.goto(BASE + '/', timeout=60000, wait_until='domcontentloaded')
    # Dismiss funding-choices consent dialog if it appears (blocks clicks, not fetch)
    for sel in ['button:has-text("Accept")', '.fc-cta-consent', 'button.fc-button']:
        try:
            _page.click(sel, timeout=2500)
            _page.wait_for_timeout(1500)
        except Exception:
            pass
    _page.wait_for_timeout(5000)
    return _page


def close():
    global _browser
    try:
        if _browser:
            _browser.close()
    except Exception:
        pass


def fetch_json(path, body=None):
    """POST/GET from page context so cookies + CF clearance ride along."""
    page = get_page()
    if body is not None:
        expr = """async ([path, body]) => {
            const r = await fetch(path, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)});
            return {status: r.status, text: await r.text()};
        }"""
        res = page.evaluate(expr, [path, body])
    else:
        expr = """async (path) => {
            const r = await fetch(path, {method:'GET'});
            return {status: r.status, text: await r.text()};
        }"""
        res = page.evaluate(expr, path)
    if res['status'] != 200:
        raise RuntimeError(f'HTTP {res["status"]} dari {path}')
    return json.loads(res['text'])


def cmd_create():
    data = fetch_json('/api/generate-email', {'ids': [1, 2, 3, 8]})
    if data.get('status') != 'success' or not data.get('email'):
        raise RuntimeError(f'Respons tak terduga: {json.dumps(data)[:200]}')
    return {'email': data['email']}


def cmd_inbox(email):
    data = fetch_json('/api/message-list', {'email': email, 'limit': 20})
    if data.get('status') != 'success':
        raise RuntimeError(f'Respons tak terduga: {json.dumps(data)[:200]}')
    msgs = []
    for m in data.get('messages', []):
        if m.get('locked'):
            continue  # pesan >24 jam butuh premium — lewati
        msgs.append({
            'messageID': m.get('id'),
            'from': m.get('from', ''),
            'subject': m.get('subject', ''),
            'time': m.get('time_ago', ''),
            'timestamp': m.get('timestamp'),
        })
    return {'messageData': msgs}


def cmd_read(email, message_id):
    # Respons: {"id","from","subject","date":unix,"content":"<html>"}
    data = fetch_json(f'/api/message/{quote(message_id, safe="")}', body=None)
    import re
    content = data.get('content') or ''
    # strip HTML tags -> plain text (juga <style> blok yang jadi noise)
    content = re.sub(r'<(style|script)[^>]*>[\s\S]*?</\1>', '', content, flags=re.I)
    text = re.sub(r'<[^>]+>', '\n', content)
    text = re.sub(r'\n\s*\n+', '\n\n', text).strip()
    date = data.get('date')
    time_str = data.get('time') or data.get('time_ago') or ''
    if not time_str and isinstance(date, (int, float)):
        import datetime
        time_str = datetime.datetime.fromtimestamp(date).strftime('%Y-%m-%d %H:%M')
    return {
        'from': data.get('from', ''),
        'subject': data.get('subject', ''),
        'time': time_str,
        'message': text or content,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No command'}))
        sys.exit(1)
    cmd = sys.argv[1]
    try:
        if cmd == 'create':
            out = cmd_create()
        elif cmd == 'inbox':
            if len(sys.argv) < 3:
                raise RuntimeError('Email required')
            out = cmd_inbox(sys.argv[2])
        elif cmd == 'read':
            if len(sys.argv) < 4:
                raise RuntimeError('Email + messageID required')
            out = cmd_read(sys.argv[2], sys.argv[3])
        else:
            raise RuntimeError(f'Unknown command: {cmd}')
        print(json.dumps(out))
    except Exception as e:
        print(json.dumps({'error': str(e)[:300]}))
        sys.exit(1)
    finally:
        close()


if __name__ == '__main__':
    main()
