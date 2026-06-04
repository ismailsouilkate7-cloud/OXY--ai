const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'public/app.js');
let content = fs.readFileSync(appFile, 'utf8');

const targetStart = `// === SESSION MANAGEMENT ===`;
const targetEnd = `document.getElementById('new-chat-btn').addEventListener('click', createNewSession);`;

const startIndex = content.indexOf(targetStart);
const endIndex = content.indexOf(targetEnd);

if (startIndex === -1 || endIndex === -1) {
    console.error('Target strings not found.');
    process.exit(1);
}

const replacement = `// === AUTH & SESSION MANAGEMENT ===
let currentUser = null;

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
            window.location.href = '/login.html';
            return false;
        }
        const data = await res.json();
        currentUser = data.user;
        userName = currentUser.name;
        userGender = currentUser.gender || 'Prefer not to say';
        document.getElementById('user-name-display').textContent = userName;
        return true;
    } catch (err) {
        window.location.href = '/login.html';
        return false;
    }
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (err) {
        console.error('Logout failed', err);
    }
});

async function loadSessionsList() {
    try {
        const res = await fetch('/api/conversations');
        if (!res.ok) return;
        const sessions = await res.json();
        
        chatList.innerHTML = '';
        sessions.forEach(session => {
            const div = document.createElement('div');
            div.className = \`chat-item \${session.id === currentSessionId ? 'active' : ''}\`;
            const titleSpan = document.createElement('span');
            titleSpan.className = 'chat-item-title';
            titleSpan.textContent = session.title;
            titleSpan.onclick = () => loadSession(session.id);
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'chat-item-actions';
            const renameBtn = document.createElement('i');
            renameBtn.className = 'fa-solid fa-pen chat-action-btn';
            renameBtn.title = 'Rename Chat';
            renameBtn.onclick = (e) => { e.stopPropagation(); renameSession(session.id, session.title); };
            const deleteBtn = document.createElement('i');
            deleteBtn.className = 'fa-solid fa-trash chat-action-btn';
            deleteBtn.title = 'Delete Chat';
            deleteBtn.onclick = (e) => { e.stopPropagation(); deleteSession(session.id); };
            actionsDiv.appendChild(renameBtn);
            actionsDiv.appendChild(deleteBtn);
            div.appendChild(titleSpan);
            div.appendChild(actionsDiv);
            chatList.appendChild(div);
        });
    } catch (err) {
        console.error('Failed to load sessions', err);
    }
}

async function deleteSession(id) {
    if (confirm("Are you sure you want to delete this conversation?")) {
        try {
            await fetch(\`/api/conversations/\${id}\`, { method: 'DELETE' });
            if (id === currentSessionId) createNewSession();
            else loadSessionsList();
        } catch (err) {
            console.error('Delete failed', err);
        }
    }
}

async function renameSession(id, oldTitle) {
    const newTitle = prompt("Enter new name for this conversation:", oldTitle);
    if (newTitle && newTitle.trim() !== '') {
        try {
            await fetch(\`/api/conversations/\${id}\`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim() })
            });
            loadSessionsList();
        } catch (err) {
            console.error('Rename failed', err);
        }
    }
}

async function loadSession(id) {
    try {
        const res = await fetch(\`/api/conversations/\${id}/messages\`);
        if (!res.ok) return;
        const messages = await res.json();
        
        currentSessionId = id;
        currentChatHistory = messages.map(m => ({
            sender: m.role === 'model' ? 'bot' : 'user',
            text: m.text
        }));
        
        renderHistory();
        loadSessionsList();
        regenBtn.style.display = currentChatHistory.length > 0 && currentChatHistory[currentChatHistory.length-1]?.sender === 'bot' ? 'flex' : 'none';
        if (window.innerWidth <= 1024) closeSidebar();
    } catch (err) {
        console.error('Failed to load session', err);
    }
}

function saveSession() {
    // Handled by the backend during /api/chat
    loadSessionsList();
}

function createNewSession() {
    currentSessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
    currentChatHistory = [];
    messagesWrapper.innerHTML = '';
    welcomeScreen.style.display = 'flex';
    regenBtn.style.display = 'none';
    pendingFiles = [];
    updateFilePreviewStrip();
    loadSessionsList();
}

`;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex);

const initTargetStart = `function initApp() {`;
const initTargetEnd = `if (!currentSessionId) createNewSession();
}`;

const initStartIndex = content.indexOf(initTargetStart);
const initEndIndex = content.indexOf(initTargetEnd) + initTargetEnd.length;

if (initStartIndex !== -1 && initEndIndex !== -1) {
    const initReplacement = `async function initApp() {
    console.log('[App] Initializing OXY AI...');
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;
    
    updateUserUI();
    loadSessionsList();
    initLocation();
    if (!currentSessionId) createNewSession();
}`;
    content = content.substring(0, initStartIndex) + initReplacement + content.substring(initEndIndex);
} else {
    console.log('initApp not found');
}

fs.writeFileSync(appFile, content, 'utf8');
console.log('Successfully patched app.js');
