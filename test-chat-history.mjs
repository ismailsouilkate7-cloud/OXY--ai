// End-to-end test for the chat history / conversation persistence flow.
// Tests: login -> create conversation (POST /api/conversations) -> list (GET)
//        -> get messages (GET /api/conversations/:id/messages) -> delete.
// Usage:  node test-chat-history.mjs           (against a running server)
//         node test-chat-history.mjs <baseUrl>
import dotenv from 'dotenv';
dotenv.config();

const BASE = process.argv[2] || 'http://localhost:3014';
const PASSWORD = process.env.VOSIL_PASSWORD;

let failures = 0;
function check(name, cond, extra = '') {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures++;
}

console.log(`Target: ${BASE}\n`);

async function request(path, { method = 'GET', cookie = '', body = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    const init = { method, headers };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(BASE + path, init);
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

let cookie = '';

// 1) Health
{
    const r = await request('/api/health');
    check('Health endpoint reachable', r.status === 200, `status=${r.status}`);
}

// 2) Login
{
    const r = await request('/api/auth/login', { method: 'POST', body: { password: PASSWORD || 'wrong' } });
    check('Login succeeds', r.status === 200, `status=${r.status}`);
    const sc = r.setCookie;
    if (sc) cookie = sc.split(';')[0];
    check('Login sets session cookie', !!cookie);
}

const testId = 'sess_e2e_' + Date.now().toString(36);
const userMsg = { role: 'user', content: 'What is 2 + 2? (e2e test)' };
const botMsg = { role: 'model', content: 'It is 4. (e2e test reply)' };

// Verify the "No chats yet" initial state (fresh user)
{
    const r = await request('/api/conversations', { cookie });
    const existing = (r.data || []).filter(c => c.id === testId);
    check('Fresh conversation absent before creation', existing.length === 0);
}

// 3) Create as soon as the FIRST message is sent (POST with only the user message)
{
    const r = await request('/api/conversations', {
        method: 'POST',
        cookie,
        body: { id: testId, title: 'What is 2 + 2? (e2e test)', messages: [userMsg] },
    });
    check('POST /api/conversations (first message) succeeds', r.status === 200, `status=${r.status}`);
}

// 4) Immediately visible in the list (real-time sidebar update)
{
    const r = await request('/api/conversations', { cookie });
    const found = (r.data || []).find(c => c.id === testId);
    check('New chat appears in GET /api/conversations', !!found, found ? `title="${found.title}"` : 'not found');
    check('New chat has a title/preview', !!found && !!found.title, found?.title?.substring(0, 40));
}

// 5) Reply arrives -> full snapshot saved (POST again with both messages)
{
    const r = await request('/api/conversations', {
        method: 'POST',
        cookie,
        body: { id: testId, title: 'What is 2 + 2? (e2e test)', messages: [userMsg, botMsg] },
    });
    check('POST /api/conversations (reply snapshot) succeeds', r.status === 200, `status=${r.status}`);
}

// 6) History loads back correctly (no duplicate rows from repeated saves)
{
    const r = await request(`/api/conversations/${testId}/messages`, { cookie });
    const msgs = Array.isArray(r.data) ? r.data : [];
    check('GET /api/conversations/:id/messages returns 200', r.status === 200, `status=${r.status}`);
    check('Both user & bot messages restored', msgs.length === 2, `count=${msgs.length}`);
    check('No duplicate messages after repeated saves', msgs.length === 2 && new Set(msgs.map(m => m.text)).size === 2, `count=${msgs.length}`);
}

// 7) Persistence across a SERVER RESTART (file-backed fallback store).
//    The test waits for the caller to restart the server when CALLER_RESTART=1.
if (process.env.CALLER_RESTART === '1') {
    console.log('\n>>> Waiting for server restart (20s) to prove disk persistence...');
    await new Promise(r => setTimeout(r, 20000));
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) {
        try {
            const r = await request('/api/conversations', { cookie });
            // New server process has an empty in-memory SESSION_STORE, so re-login first.
            if (r.status === 200) { ok = true; }
            else if (r.status === 401) {
                const lr = await request('/api/auth/login', { method: 'POST', body: { password: PASSWORD } });
                cookie = (lr.setCookie || '').split(';')[0];
            }
        } catch { await new Promise(r => setTimeout(r, 1000)); }
    }
    const r = await request('/api/conversations', { cookie });
    const found = (r.data || []).find(c => c.id === testId);
    check('Chat SURVIVES a server restart', !!found, found ? `title="${found.title}"` : JSON.stringify(r.data).substring(0, 200));
}

// 8) Delete
{
    const r = await request(`/api/conversations/${testId}`, { method: 'DELETE', cookie });
    check('DELETE /api/conversations/:id succeeds', r.status === 200, `status=${r.status}`);
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}`);
// NOTE: do not call process.exit(0) here — on Windows a forced exit while the
// global fetch pool still holds keep-alive sockets trips a harmless libuv
// assertion and flips the exit code. Natural exit is clean.
if (failures > 0) process.exit(1);