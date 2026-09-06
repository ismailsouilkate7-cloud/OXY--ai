// Verifies a conversation created BEFORE a server restart is still there.
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
const BASE = process.argv[2] || 'http://localhost:3014';
const PASSWORD = process.env.VOSIL_PASSWORD;
const testId = fs.readFileSync('test-persist-id.txt', 'utf8').trim();

let failures = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e ? ' — ' + e : ''}`); if (!c) failures++; };

let cookie = '';
const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
});
const sc = login.headers.get('set-cookie');
cookie = sc ? sc.split(';')[0] : '';
check('Re-login after restart works', login.status === 200, `status=${login.status}`);

const list = await fetch(BASE + '/api/conversations', { headers: { Cookie: cookie } });
const data = await list.json();
const found = (data || []).find(c => c.id === testId);
check(`Chat "${testId}" survives server restart (file-backed store)`, !!found, found ? `title="${found.title}"` : JSON.stringify(data).substring(0, 160));

const msgs = await fetch(BASE + `/api/conversations/${testId}/messages`, { headers: { Cookie: cookie } });
const msgData = await msgs.json();
check('Messages still load after restart', Array.isArray(msgData) && msgData.length === 2, `count=${Array.isArray(msgData) ? msgData.length : 'n/a'}`);

const del = await fetch(BASE + `/api/conversations/${testId}`, { method: 'DELETE', headers: { Cookie: cookie } });
check('Cleanup delete after restart', del.status === 200, `status=${del.status}`);

console.log(failures === 0 ? '\nRESTART PERSISTENCE OK' : `\n${failures} FAILURES`);
if (failures > 0) process.exit(1);