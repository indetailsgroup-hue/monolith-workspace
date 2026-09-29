"""Send deployment workflow results through LINE without logging credentials."""
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request
import uuid


def report(env, message):
    print(message)
    if env.get('GITHUB_STEP_SUMMARY'):
        with Path(env['GITHUB_STEP_SUMMARY']).open('a', encoding='utf-8') as stream:
            stream.write('## LINE notification\n\n' + message + '\n')


def notify(env, sender=urllib.request.urlopen):
    conclusion = env.get('SOURCE_CONCLUSION', '')
    if conclusion not in ('success', 'failure'):
        report(env, 'SKIPPED: source workflow did not succeed or fail.')
        return 0
    token = env.get('LINE_CHANNEL_ACCESS_TOKEN', '').strip()
    recipient = env.get('LINE_DEPLOY_RECIPIENT_ID', '').strip()
    if not token or not recipient:
        report(env, '::warning::SKIPPED: configure LINE_MONOLITH_CHANNEL_ACCESS_TOKEN and LINE_DEPLOY_RECIPIENT_ID. No message sent.')
        return 0
    repo = env.get('GITHUB_REPOSITORY', '')
    run_id = env.get('SOURCE_RUN_ID', '')
    sha = env.get('SOURCE_SHA', '')
    if not (re.fullmatch(r'[UCR][0-9a-f]{32}', recipient)
            and re.fullmatch(r'[\w.-]+/[\w.-]+', repo)
            and run_id.isdigit() and re.fullmatch(r'[0-9a-f]{40}', sha)):
        report(env, '::error::FAILED: invalid notification metadata or recipient ID.')
        return 1
    workflow = env.get('SOURCE_WORKFLOW', 'Docs deployment')[:200]
    text = (f'Monolith Manufacturing OS\n{workflow}\n'
            f'ผล workflow / Workflow result: {conclusion}\n'
            f'Source workflow SHA: {sha}\n'
            f'https://github.com/{repo}/actions/runs/{run_id}\n'
            'GitHub Pages: https://indetailsgroup-hue.github.io/monolith-workspace/\n'
            'ผลนี้ไม่ยืนยัน SciSpace deployment / SciSpace deployment is not verified by this result.')
    payload = {'to': recipient, 'messages': [{'type': 'text', 'text': text}]}
    request = urllib.request.Request(
        'https://api.line.me/v2/bot/message/push',
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
                 'X-Line-Retry-Key': str(uuid.uuid5(uuid.NAMESPACE_URL, f'{repo}/{run_id}/{conclusion}/' + json.dumps(payload, sort_keys=True, ensure_ascii=False)))},
        method='POST')
    try:
        with sender(request, timeout=30) as response:
            if response.status != 200:
                report(env, f'::error::FAILED: LINE HTTP {response.status}.')
                return 1
    except urllib.error.HTTPError as error:
        if error.code == 409 and error.headers.get('x-line-accepted-request-id'):
            report(env, 'ACCEPTED previously by LINE (same retry key); recipient delivery remains unverified.')
            return 0
        report(env, f'::error::FAILED: LINE HTTP {error.code}.')
        return 1
    except (urllib.error.URLError, OSError):
        report(env, '::error::FAILED: LINE network request failed; inspect connectivity and retry the run.')
        return 1
    report(env, 'ACCEPTED by LINE API; recipient delivery remains unverified.')
    return 0


if __name__ == '__main__':
    raise SystemExit(notify(os.environ))
