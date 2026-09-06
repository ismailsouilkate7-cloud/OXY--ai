// Creates a conversation that will be verified AFTER a server restart.
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
const BASE = process.argv[2] || 'http://localhost:3014';
const PASSWORD = process.env.VOSIL_PASSWORD;

const testId = 'sess_restart_' + Date.now().toString(36);
let cookie = '';

const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
});
const sc = login.headers.get('set-cookie');
cookie = sc ? sc.split(';')[0] : '';

const res = await fetch(BASE + '/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
        id: testId,
        title: 'Restart persistence test',
        messages: [
            { role: 'user', content: 'Hello, survive the restart!' },
            { role: 'model', content: 'I am here to stay. (restart e2e)' },
        ],
    }),
});
fs.writeFileSync('test-persist-id.txt', testId, 'utf8');
console.log(`CREATED ${testId} status=${res.status}`);