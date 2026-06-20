// ============================================================
// VOSIL — Full Multimodal Chat App
// ============================================================

// === DOM ELEMENTS ===
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesWrapper = document.getElementById('messages-wrapper');
const welcomeScreen = document.getElementById('welcome-screen');
const typingIndicator = document.getElementById('typing-indicator');
const chatContainer = document.getElementById('chat-container');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.querySelector('.sidebar');
const stopBtn = document.getElementById('stop-btn');
const regenBtn = document.getElementById('regen-btn');
const chatList = document.getElementById('chat-list');
const clearChatBtn = document.getElementById('clear-chat-btn');
const shareBtn = document.getElementById('share-btn');

// === AUTHENTICATED FETCH HELPER ===
async function apiFetch(url, options = {}) {
    const headers = { ...options.headers };
    if (window.currentUser && typeof window.currentUser.getIdToken === 'function') {
        try {
            const token = await window.currentUser.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
            headers['X-User-Id'] = window.currentUser.uid;
        } catch { /* token fetch failed — proceed without auth */ }
    }
    return fetch(url, { ...options, headers });
}

// === LOCATION SERVICE ===
let userLocation = (typeof vosilPersistence !== 'undefined' ? vosilPersistence.getItem('vosil_user_location') : localStorage.getItem('vosil_user_location')) || null;

async function fetchUserLocation() {
    try {
        const response = await fetch('/api/location');
        const data = await response.json();
        const location = `${data.city || ''}, ${data.region || ''} ${data.country_name || ''}`.replace(/,\s*$/, '').trim();
        return location || null;
    } catch (err) {
        console.warn('Could not fetch location:', err);
        return null;
    }
}

function initLocation() {
    fetchUserLocation().then(location => {
        if (location) {
            userLocation = location;
            if (typeof vosilPersistence !== 'undefined') {
                vosilPersistence.setItemSync('vosil_user_location', location);
            } else {
                localStorage.setItem('vosil_user_location', location);
            }
            if (OXYWidgetRenderer && OXYWidgetRenderer.setUserLocation) {
                OXYWidgetRenderer.setUserLocation(location);
            }
        }
    });
}

const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const attachMenu = document.getElementById('attach-menu');
const attachMenuContainer = document.getElementById('attach-menu-container');
const menuAddFiles = document.getElementById('menu-add-files');
const menuScreenshot = document.getElementById('menu-screenshot');
const menuCamera = document.getElementById('menu-camera');
const menuRecent = document.getElementById('menu-recent');
const filePreviewStrip = document.getElementById('file-preview-strip');
const dropZoneOverlay = document.getElementById('drop-zone-overlay');
const inputWrapper = document.getElementById('input-wrapper');

const cameraModal = document.getElementById('camera-modal');
const cameraPreview = document.getElementById('camera-preview');
const cameraCanvas = document.getElementById('camera-canvas');
const cameraCaptureBtn = document.getElementById('camera-capture-btn');
const cameraFlipBtn = document.getElementById('camera-flip-btn');
const cameraCloseBtn = document.getElementById('camera-close-btn');

const recentFilesModal = document.getElementById('recent-files-modal');
const recentFilesBody = document.getElementById('recent-files-body');
const recentFilesCloseBtn = document.getElementById('recent-files-close-btn');

const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxDownload = document.getElementById('lightbox-download');
const lightboxCounter = document.getElementById('lightbox-counter');

let lightboxImages = [];
let lightboxCurrentIndex = 0;

// === STATE ===
let currentSessionId = '';
let abortController = null;
let isGenerating = false;
let isUploading = false;
let isProcessingFiles = false;
let currentChatHistory = [];
let userGender = 'Prefer not to say';
let pendingFiles = [];
let cameraStream = null;
let cameraFacingMode = 'user';
let fileIdCounter = 0;

function getRecentFiles() {
    if (typeof vosilPersistence !== 'undefined') {
        const val = vosilPersistence.getItem('vosil_recent_files');
        return Array.isArray(val) ? val : [];
    }
    try { return JSON.parse(localStorage.getItem('vosil_recent_files') || '[]'); } catch { return []; }
}

function addRecentFile(fileInfo) {
    const recent = getRecentFiles();
    const existing = recent.findIndex(r => r.name === fileInfo.name);
    if (existing !== -1) recent.splice(existing, 1);
    recent.unshift({ name: fileInfo.name, type: fileInfo.type, size: fileInfo.size, addedAt: Date.now() });
    if (recent.length > 20) recent.pop();
    if (typeof vosilPersistence !== 'undefined') {
        vosilPersistence.setItemSync('vosil_recent_files', recent);
    } else {
        localStorage.setItem('vosil_recent_files', JSON.stringify(recent));
    }
}

window.showToast = function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);
};

function updateUserUI() {
    const display = document.querySelector('.user-name');
    if (display) display.textContent = userName;
}

if (shareBtn) shareBtn.addEventListener('click', () => {
    if (!currentSessionId) return;
    const shareLink = `${window.location.origin}/share/${currentSessionId}`;
    navigator.clipboard.writeText(shareLink).then(() => {
        showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
        showToast(`Share link: ${shareLink}`, 'info');
    });
});

marked.use({ langPrefix: 'hljs language-', breaks: true });

function updateWelcomeGreeting() {
    try {
        const now = new Date(); const hour = now.getHours();
        let part = 'Good day';
        if (hour >= 5 && hour < 12) part = 'Good morning';
        else if (hour >= 12 && hour < 18) part = 'Good afternoon';
        else part = 'Good evening';
        const name = userName || 'User';
        const titleEl = document.querySelector('#welcome-screen h1');
        const subEl = document.querySelector('#welcome-screen p');
        if (titleEl) titleEl.textContent = `${part}, ${name}`;
        if (subEl) subEl.textContent = 'How can I help you today?';
    } catch (e) { /* no-op */ }
}

function showChatListLoading() {
    chatList.innerHTML = '<div class="chat-list-loader"><span class="loading-spinner-xs"></span> Loading chats...</div>';
}

function showChatListEmpty() {
    chatList.innerHTML = '<div class="chat-list-empty"><i class="fa-solid fa-comment-slash"></i><span>No chats yet</span></div>';
}

async function saveSessionToDb() {
    if (!currentSessionId) return;
    try {
        // Build messages from currentChatHistory for DB storage
        const messages = currentChatHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            content: msg.text || ''
        }));
        
        // Only save if we have messages
        if (messages.length === 0) return;
        
        // Get first user message as title (truncate to first 80 chars)
        const firstUserMsg = messages.find(m => m.role === 'user');
        const title = firstUserMsg 
            ? firstUserMsg.content.replace(/[\n\r]+/g, ' ').trim().substring(0, 80) || 'New Chat'
            : 'New Chat';
        
        const res = await apiFetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentSessionId, title, messages })
        });
        if (!res.ok) console.warn('[Save] Failed to save conversation');
    } catch (err) {
        console.warn('[Save] Error saving conversation:', err.message);
    }
}

async function loadSessionsList() {
    showChatListLoading();
    try {
        const res = await apiFetch('/api/conversations');
        if (!res.ok) {
            showChatListEmpty();
            return;
        }
        const sessions = await res.json();
        chatList.innerHTML = '';
        if (!sessions || sessions.length === 0) {
            showChatListEmpty();
            return;
        }
        sessions.forEach(session => {
            const div = document.createElement('div');
            div.className = `chat-item ${session.id === currentSessionId ? 'active' : ''}`;
            const titleSpan = document.createElement('span');
            titleSpan.className = 'chat-item-title';
            titleSpan.textContent = session.title || 'New Chat';
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
        showChatListEmpty();
    }
}

async function deleteSession(id) {
    if (confirm("Are you sure you want to delete this conversation?")) {
        try {
            await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
            if (id === currentSessionId) createNewSession();
            else loadSessionsList();
        } catch (err) { console.error('Delete failed', err); }
    }
}

async function renameSession(id, oldTitle) {
    const newTitle = prompt("Enter new name for this conversation:", oldTitle);
    if (newTitle && newTitle.trim() !== '') {
        try {
            await apiFetch(`/api/conversations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle.trim() }) });
            loadSessionsList();
        } catch (err) { console.error('Rename failed', err); }
    }
}

async function loadSession(id) {
    try {
        const res = await apiFetch(`/api/conversations/${id}/messages`);
        if (!res.ok) return;
        const messages = await res.json();
        currentSessionId = id;
        currentChatHistory = messages.map(m => ({ sender: m.role === 'model' ? 'bot' : 'user', text: m.text }));
        renderHistory();
        loadSessionsList();
        regenBtn.style.display = currentChatHistory.length > 0 && currentChatHistory[currentChatHistory.length-1]?.sender === 'bot' ? 'flex' : 'none';
        if (window.innerWidth <= 1024) closeSidebar();
    } catch (err) { console.error('Failed to load session', err); }
}

function saveSession() { 
    // Save to DB in background (non-blocking)
    saveSessionToDb();
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
    updateWelcomeGreeting();
}

document.getElementById('new-chat-btn')?.addEventListener('click', createNewSession);
if (clearChatBtn) clearChatBtn.addEventListener('click', () => { if (confirm("Are you sure you want to clear this chat?")) createNewSession(); });

const sidebarOverlay = document.getElementById('sidebar-overlay');

function openSidebar() {
    sidebar.classList.add('open');
    sidebar.classList.remove('closed');
    sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (typeof vosilPersistence !== 'undefined') vosilPersistence.setItem('vosil_sidebar_open', true);
}
function closeSidebar() {
    sidebar.classList.remove('open');
    sidebar.classList.add('closed');
    sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
    if (typeof vosilPersistence !== 'undefined') vosilPersistence.setItem('vosil_sidebar_open', false);
}
function isSidebarOpen() {
    return sidebar.classList.contains('open');
}

const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', (e) => { e.stopPropagation(); isSidebarOpen() ? closeSidebar() : openSidebar(); });
if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); isSidebarOpen() ? closeSidebar() : openSidebar(); });
// Header new chat button (minimal header)
document.getElementById('header-new-chat-btn')?.addEventListener('click', createNewSession);

// Close sidebar when clicking outside
sidebarOverlay?.addEventListener('click', (e) => { e.stopPropagation(); closeSidebar(); });
document.getElementById('sidebar-close-btn')?.addEventListener('click', (e) => { e.stopPropagation(); closeSidebar(); });
document.addEventListener('click', (e) => {
    if (!isSidebarOpen()) return;
    if (sidebarToggleBtn?.contains(e.target)) return;
    if (sidebar?.contains(e.target)) return;
    closeSidebar();
});

// Close sidebar on window resize
window.addEventListener('resize', () => {
    if (isSidebarOpen()) closeSidebar();
});

let attachMenuOpen = false;

function toggleAttachMenu(e) { if (e) e.stopPropagation(); attachMenuOpen = !attachMenuOpen; if (attachMenu) attachMenu.classList.toggle('visible', attachMenuOpen); }
function closeAttachMenu() { attachMenuOpen = false; if (attachMenu) attachMenu.classList.remove('visible'); }

if (attachBtn) attachBtn.addEventListener('click', toggleAttachMenu);
document.addEventListener('click', (e) => { if (attachMenuOpen && !attachMenuContainer.contains(e.target)) closeAttachMenu(); });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (attachMenuOpen) { closeAttachMenu(); return; }
        if (cameraModal && cameraModal.style.display !== 'none') { closeCamera(); return; }
        if (recentFilesModal && recentFilesModal.style.display !== 'none') { closeRecentFilesModal(); return; }
        if (lightboxModal && lightboxModal.classList.contains('open')) { closeLightbox(); return; }
        if (isSidebarOpen()) closeSidebar();
    }
});

if (menuAddFiles) menuAddFiles.addEventListener('click', () => { closeAttachMenu(); if (fileInput) fileInput.click(); });
if (menuScreenshot) menuScreenshot.addEventListener('click', () => { closeAttachMenu(); captureScreenshot(); });
if (menuCamera) menuCamera.addEventListener('click', () => { closeAttachMenu(); openCamera(); });
if (menuRecent) menuRecent.addEventListener('click', () => { closeAttachMenu(); openRecentFilesModal(); });

if (fileInput) fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const sendBtn = document.getElementById('send-btn');
        const msgInput = document.getElementById('message-input');
        sendBtn.disabled = true;
        msgInput.disabled = true;
        addFilesToPending(e.target.files);
        // Safety timeout: re-enable input after 10 seconds even if upload hangs/stalls
        const safetyTimer = setTimeout(() => {
            sendBtn.disabled = false;
            msgInput.disabled = false;
            console.warn('[Safety] Re-enabled input after timeout (upload may have hung)');
        }, 10000);
        uploadFiles(e.target.files).finally(() => { 
            clearTimeout(safetyTimer);
            sendBtn.disabled = false; 
            msgInput.disabled = false; 
        });
        e.target.value = '';
    }
});

async function uploadFiles(files) {
    console.log('Uploading files...', files);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
}

function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const url = URL.createObjectURL(file);
        video.src = url;
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(video.duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video metadata'));
        };
        setTimeout(() => {
            URL.revokeObjectURL(url);
            reject(new Error('Video metadata load timed out'));
        }, 10000);
    });
}

async function addFilesToPending(fileList) {
    const maxSize = 50 * 1024 * 1024;
    const maxTotal = 10;
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm'];
    const errors = [];
    for (const file of fileList) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            errors.push(`"${file.name}" is not supported. Please use PDF, images, or video.`);
            continue;
        }
        if (pendingFiles.length >= maxTotal) { errors.push(`Maximum ${maxTotal} files allowed`); break; }
        if (file.size > maxSize) { 
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            if (file.type.startsWith('video/')) {
                errors.push('Video size must be less than 50MB.'); 
            } else {
                errors.push(`"${file.name}" is too large (${sizeMB}MB, max 50MB)`); 
            }
            continue; 
        }
        if (file.size === 0) { errors.push(`"${file.name}" is empty`); continue; }
        const id = ++fileIdCounter;
        const preview = generatePreview(file);
        const fileObj = { id, file, preview, name: file.name, size: file.size, type: file.type, duration: null };

        if (file.type.startsWith('video/')) {
            pendingFiles.push({ ...fileObj, checkingDuration: true });
            updateFilePreviewStrip();
            updateSendButton();

            try {
                const duration = await getVideoDuration(file);
                const idx = pendingFiles.findIndex(f => f.id === id);
                if (idx === -1) continue;

                if (duration > 40) {
                    pendingFiles.splice(idx, 1);
                    showToast('Video must be 40 seconds or less.', 'warning');
                    updateFilePreviewStrip();
                    updateSendButton();
                    continue;
                }

                pendingFiles[idx].duration = duration;
                pendingFiles[idx].checkingDuration = false;
                updateFilePreviewStrip();
                updateSendButton();
            } catch (err) {
                const idx = pendingFiles.findIndex(f => f.id === id);
                if (idx !== -1) {
                    pendingFiles[idx].checkingDuration = false;
                    updateFilePreviewStrip();
                }
            }
        } else {
            pendingFiles.push(fileObj);
        }
    }
    if (errors.length > 0) showToast(errors[0], 'warning');
    updateFilePreviewStrip();
    updateSendButton();
}

function generatePreview(file) {
    if (file.type.startsWith('image/')) return URL.createObjectURL(file);
    if (file.type.startsWith('video/')) return URL.createObjectURL(file);
    return null;
}

function getFileIcon(type, name) {
    const ext = name?.split('.').pop()?.toLowerCase();
    if (type?.startsWith('image/')) return 'fa-file-image';
    if (type === 'application/pdf') return 'fa-file-pdf';
    if (type?.includes('zip') || ext === 'zip') return 'fa-file-zipper';
    if (type?.includes('word') || ext === 'docx') return 'fa-file-word';
    if (type === 'text/csv' || ext === 'csv') return 'fa-file-csv';
    if (type === 'application/json' || ext === 'json') return 'fa-file-code';
    if (['js','ts','html','css','py','java','cpp','c','jsx','tsx'].includes(ext)) return 'fa-file-code';
    if (type?.startsWith('text/') || ['txt','md'].includes(ext)) return 'fa-file-lines';
    return 'fa-file';
}

function getFileColor(type, name) {
    const ext = name?.split('.').pop()?.toLowerCase();
    if (type?.startsWith('image/')) return '#a855f7';
    if (type === 'application/pdf') return '#ef4444';
    if (type?.includes('zip') || ext === 'zip') return '#eab308';
    if (['js','ts','html','css','py','java','cpp','c'].includes(ext)) return '#22c55e';
    if (type?.startsWith('text/') || ['txt','md'].includes(ext)) return '#3b82f6';
    return '#6b7280';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function removePendingFile(id) {
    const file = pendingFiles.find(f => f.id === id);
    if (file?.preview) URL.revokeObjectURL(file.preview);
    pendingFiles = pendingFiles.filter(f => f.id !== id);
    updateFilePreviewStrip();
    updateSendButton();
}

function clearPendingFiles() {
    pendingFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    pendingFiles = [];
    updateFilePreviewStrip();
    updateSendButton();
}

function updateFilePreviewStrip() {
    if (pendingFiles.length === 0) { filePreviewStrip.style.display = 'none'; filePreviewStrip.innerHTML = ''; return; }
    filePreviewStrip.style.display = 'flex';
    filePreviewStrip.innerHTML = pendingFiles.map(f => {
        const icon = getFileIcon(f.type, f.name);
        const color = getFileColor(f.type, f.name);
        const size = formatFileSize(f.size);
        let thumbHtml;
        if (f.preview) {
            if (f.type.startsWith('image/')) {
                thumbHtml = `<img src="${f.preview}" class="preview-thumb" alt="" loading="lazy">`;
            } else if (f.type.startsWith('video/')) {
                let durationHtml = '';
                if (f.checkingDuration) {
                    durationHtml = '<span class="preview-duration">Checking…</span>';
                } else if (f.duration != null) {
                    const secs = Math.round(f.duration);
                    durationHtml = `<span class="preview-duration">${secs}s</span>`;
                }
                thumbHtml = `<video src="${f.preview}" class="preview-thumb"></video><div class="video-preview-overlay"><i class="fa-solid fa-play"></i></div>${durationHtml}`;
            } else {
                thumbHtml = `<div class="preview-icon-bg" style="background:${color}20;color:${color}"><i class="fa-solid ${icon}"></i></div>`;
            }
        } else {
            thumbHtml = `<div class="preview-icon-bg" style="background:${color}20;color:${color}"><i class="fa-solid ${icon}"></i></div>`;
        }
        return `<div class="preview-item" data-id="${f.id}">
            <button class="preview-remove" onclick="removePendingFile(${f.id})"><i class="fa-solid fa-xmark"></i></button>
            <div class="preview-thumb-wrap">${thumbHtml}</div>
            <div class="preview-info"><span class="preview-name">${f.name.length > 20 ? f.name.substring(0, 18) + '…' : f.name}</span><span class="preview-size">${f.type.startsWith('video/') && f.duration != null ? Math.round(f.duration) + 's · ' + size : size}</span></div>
        </div>`;
    }).join('');
}

function setUploadingState(uploading) {
    isUploading = uploading;
    if (inputWrapper) inputWrapper.classList.toggle('uploading', uploading);
    document.querySelectorAll('.preview-item').forEach(item => item.classList.toggle('uploading', uploading));
}

function updateSendButton() {
    const hasText = messageInput.value.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    const checkingVideo = pendingFiles.some(f => f.checkingDuration);
    sendBtn.disabled = !(hasText || hasFiles) || isUploading || isProcessingFiles || checkingVideo;
}

let dragCounter = 0;
if (chatContainer) {
    chatContainer.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; if (dropZoneOverlay) dropZoneOverlay.classList.add('visible'); });
    chatContainer.addEventListener('dragover', (e) => e.preventDefault());
    chatContainer.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; if (dropZoneOverlay) dropZoneOverlay.classList.remove('visible'); } });
    chatContainer.addEventListener('drop', (e) => { e.preventDefault(); dragCounter = 0; if (dropZoneOverlay) dropZoneOverlay.classList.remove('visible'); if (e.dataTransfer.files.length > 0) addFilesToPending(e.dataTransfer.files); });
}
document.querySelector('.chat-main')?.addEventListener('drop', (e) => { e.preventDefault(); dragCounter = 0; if (dropZoneOverlay) dropZoneOverlay.classList.remove('visible'); if (e.dataTransfer.files.length > 0) addFilesToPending(e.dataTransfer.files); });

document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = [];
    for (const item of items) { if (item.type.startsWith('image/')) imageItems.push(item); }
    if (imageItems.length > 0) {
        e.preventDefault();
        const files = await Promise.all(imageItems.map(async (item) => { const blob = item.getAsFile(); if (blob) return new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type }); return null; }));
        const validFiles = files.filter(Boolean);
        if (validFiles.length > 0) { addFilesToPending(validFiles); showToast('Image pasted from clipboard', 'success'); }
    }
});

async function captureScreenshot() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ preferCurrentTab: true });
        const track = stream.getVideoTracks()[0];
        const imgCapture = new ImageCapture(track);
        const bitmap = await imgCapture.grabFrame();
        track.stop();
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) { const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' }); addFilesToPending([file]); showToast('Screenshot captured!', 'success'); }
    } catch (err) { if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') showToast('Screenshot failed. Try pasting with Ctrl+V instead.', 'error'); }
}

async function openCamera() {
    try {
        cameraModal.style.display = 'flex';
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        cameraPreview.srcObject = cameraStream;
    } catch (err) { cameraModal.style.display = 'none'; showToast('Camera access denied. Please allow camera permissions.', 'error'); }
}

function closeCamera() { if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; } if (cameraPreview) cameraPreview.srcObject = null; if (cameraModal) cameraModal.style.display = 'none'; }
if (cameraCloseBtn) cameraCloseBtn.addEventListener('click', closeCamera);
if (cameraFlipBtn) cameraFlipBtn.addEventListener('click', () => { cameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user'; if (cameraStream) cameraStream.getTracks().forEach(t => t.stop()); openCamera(); });
if (cameraCaptureBtn) cameraCaptureBtn.addEventListener('click', () => {
    const canvas = cameraCanvas;
    canvas.width = cameraPreview.videoWidth; canvas.height = cameraPreview.videoHeight;
    const ctx = canvas.getContext('2d');
    if (cameraFacingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(cameraPreview, 0, 0);
    canvas.toBlob((blob) => {
        if (blob) { const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }); addFilesToPending([file]); showToast('Photo captured!', 'success'); }
        closeCamera();
    }, 'image/jpeg', 0.92);
});

function openRecentFilesModal() {
    const recent = getRecentFiles();
    recentFilesBody.innerHTML = '';
    if (recent.length === 0) {
        recentFilesBody.innerHTML = '<div class="recent-files-empty"><i class="fa-solid fa-folder-open"></i><span>No recent files yet</span></div>';
    } else {
        recent.forEach((file, idx) => {
            const icon = getFileIcon(file.type, file.name);
            const color = getFileColor(file.type, file.name);
            const size = formatFileSize(file.size); const timeAgo = getTimeAgo(file.addedAt);
            const item = document.createElement('div');
            item.className = 'recent-file-item';
            item.innerHTML = `<div class="recent-file-icon" style="background:${color}18;color:${color}"><i class="fa-solid ${icon}"></i></div>
                <div class="recent-file-info"><div class="recent-file-name">${file.name}</div><div class="recent-file-meta">${size} · ${timeAgo}</div></div>`;
            item.addEventListener('click', () => { closeRecentFilesModal(); fileInput.click(); showToast(`Select "${file.name}" from your files`, 'info'); });
            recentFilesBody.appendChild(item);
        });
    }
    if (recentFilesModal) recentFilesModal.style.display = 'flex';
}

function closeRecentFilesModal() { if (recentFilesModal) recentFilesModal.style.display = 'none'; }
if (recentFilesCloseBtn) recentFilesCloseBtn.addEventListener('click', closeRecentFilesModal);
if (recentFilesModal) recentFilesModal.addEventListener('click', (e) => { if (e.target === recentFilesModal) closeRecentFilesModal(); });

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
}

function openLightbox(images, startIndex = 0) {
    if (!images || images.length === 0) return;
    lightboxImages = images; lightboxCurrentIndex = startIndex;
    showLightboxImage();
    lightboxModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function showLightboxImage() {
    const img = lightboxImages[lightboxCurrentIndex]; if (!img) return;
    const src = img.url || img.preview || img.src;
    lightboxImg.src = src; lightboxImg.alt = img.name || 'Image';
    if (lightboxImages.length > 1) { lightboxCounter.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`; lightboxCounter.style.display = 'block'; }
    else { lightboxCounter.style.display = 'none'; }
    lightboxDownload.onclick = () => { const a = document.createElement('a'); a.href = src; a.download = img.name || 'image'; a.click(); };
}

function closeLightbox() { if (lightboxModal) lightboxModal.classList.remove('open'); document.body.style.overflow = ''; }
if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
if (lightboxModal) lightboxModal.addEventListener('click', (e) => { if (e.target === lightboxModal) closeLightbox(); });
document.addEventListener('keydown', (e) => {
    if (!lightboxModal || !lightboxModal.classList.contains('open')) return;
    if (e.key === 'ArrowLeft' && lightboxImages.length > 1) { e.preventDefault(); lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxImages.length) % lightboxImages.length; showLightboxImage(); }
    if (e.key === 'ArrowRight' && lightboxImages.length > 1) { e.preventDefault(); lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxImages.length; showLightboxImage(); }
});

function buildFileAttachments(files) {
    const attachGrid = document.createElement('div');
    attachGrid.className = 'msg-attachments-grid';
    if (files.length > 1) attachGrid.classList.add('multiple-attachments');
    const imageFiles = files.filter(f => f.type?.startsWith('image/'));
    files.forEach((f) => {
        let attachEl;
        if (f.type?.startsWith('image/') && (f.url || f.preview)) {
            attachEl = document.createElement('img');
            attachEl.className = 'msg-attach-img';
            if (imageFiles.length >= 3) attachEl.classList.add('small-multi');
            attachEl.src = f.url || f.preview;
            attachEl.alt = f.name; attachEl.loading = 'lazy';
            attachEl.style.cursor = 'pointer';
            const imgIndex = imageFiles.indexOf(f);
            attachEl.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(imageFiles, Math.max(0, imgIndex)); });
        } else if (f.type?.startsWith('video/') && (f.url || f.preview)) {
            attachEl = document.createElement('div');
            attachEl.className = 'msg-attach-video-wrap';
            const video = document.createElement('video');
            video.className = 'msg-attach-video';
            video.src = f.url || f.preview;
            video.controls = true;
            attachEl.appendChild(video);
        } else {
            attachEl = document.createElement('div');
            attachEl.className = 'msg-attach-file-card';
            const icon = getFileIcon(f.type, f.name);
            const color = getFileColor(f.type, f.name);
            const size = formatFileSize(f.size);
            let actionsHtml = '';
            if (f.url) {
                if (f.type === 'application/pdf') {
                    const escapedUrl = f.url.replace(/'/g, '\\x27');
                    const escapedName = (f.name || 'document.pdf').replace(/'/g, '\\x27');
                    actionsHtml += `<button class="file-card-btn preview-btn" onclick="event.stopPropagation();if(window.OXYPDFViewer){window.OXYPDFViewer.openPdf('${escapedUrl}','${escapedName}')}else{window.open('${escapedUrl}','_blank')}" title="Preview"><i class="fa-solid fa-eye"></i></button>`;
                }
                actionsHtml += `<button class="file-card-btn" onclick="event.stopPropagation();window.open('${f.url}','_blank')" title="Download"><i class="fa-solid fa-download"></i></button>`;
            }
            attachEl.innerHTML = `<div class="file-card-icon" style="background:${color}20;color:${color}"><i class="fa-solid ${icon}"></i></div>
                <div class="file-card-info"><span class="file-card-name">${f.name}</span><span class="file-card-meta">${size}</span></div>
                <div class="file-card-actions">${actionsHtml}</div>`;
            if (f.url) { attachEl.style.cursor = 'pointer'; attachEl.addEventListener('click', () => window.open(f.url, '_blank')); }
        }
        if (attachEl) { const wrapper = document.createElement('div'); wrapper.className = 'msg-attachment'; wrapper.appendChild(attachEl); attachGrid.appendChild(wrapper); }
    });
    return attachGrid;
}

function appendMessage(text, sender, finalRender = true, files = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.dataset.messageText = text;
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (sender === 'user') {
        const displayName = userName || 'User';
        const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        avatar.textContent = initials;
    } else { avatar.innerHTML = '<div class="logo-ring msg-ring"><div class="logo-ring-glow"></div></div>'; }
    const content = document.createElement('div');
    content.className = 'message-content';
    if (files && files.length > 0) { const attachGrid = buildFileAttachments(files); content.appendChild(attachGrid); }
    if (sender === 'user') {
        if (text && finalRender) { const textEl = document.createElement('div'); textEl.className = 'msg-text-content'; textEl.textContent = text; content.appendChild(textEl); }
    } else if (finalRender && text) {
        const widgetResult = typeof OXYWidgetRenderer !== 'undefined' ? OXYWidgetRenderer.detectAndRender(text) : null;
        if (widgetResult) { const widgetWrap = document.createElement('div'); widgetWrap.className = 'oxy-widget-container'; widgetWrap.innerHTML = widgetResult.html; content.appendChild(widgetWrap); }
        else { const textWrap = document.createElement('div'); const rawHtml = typeof marked !== 'undefined' ? marked.parse(text) : text; textWrap.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml; content.appendChild(textWrap); formatCodeBlocks(content); }
    }
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    contentWrapper.style.position = 'relative'; contentWrapper.style.display = 'flex'; contentWrapper.style.flexDirection = 'column';
    contentWrapper.style.alignItems = sender === 'user' ? 'flex-end' : 'flex-start'; contentWrapper.style.flex = '1'; contentWrapper.style.minWidth = '0';
    contentWrapper.appendChild(content);
    if (sender === 'user') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = `<button class="msg-action-btn" onclick="copyMessage('${text.replace(/'/g, '\\x27')}')" title="Copy"><i class="fa-regular fa-copy"></i></button>
            <button class="msg-action-btn" onclick="editMessage(this)" title="Edit"><i class="fa-solid fa-pen"></i></button>`;
        contentWrapper.appendChild(actionsDiv);
    }
    msgDiv.appendChild(avatar); msgDiv.appendChild(contentWrapper);
    messagesWrapper.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return msgDiv;
}

function handleSend() {
    const text = messageInput.value.trim();
    console.log('[Input] handleSend called, text:', text ? `"${text.substring(0, 50)}..."` : '(empty)', 'files:', pendingFiles.length, 'generating:', isGenerating, 'uploading:', isUploading);
    if ((!text && pendingFiles.length === 0) || isGenerating || isUploading) {
        console.log('[Input] handleSend blocked — no text/files, or already generating/uploading');
        return;
    }
    messageInput.value = ''; messageInput.style.height = 'auto'; sendBtn.disabled = true;
    const filesForHistory = pendingFiles.map(f => { addRecentFile({ name: f.name, type: f.type, size: f.size }); return { name: f.name, type: f.type, size: f.size, preview: f.preview }; });
    currentChatHistory.push({ text: text, sender: 'user', files: filesForHistory });
    renderHistory();
    if (pendingFiles.length > 0) preprocessAndSend(text, pendingFiles);
    else { sendMessage(text, [], false); clearPendingFiles(); }
}

function renderHistory() {
    messagesWrapper.innerHTML = '';
    welcomeScreen.style.display = currentChatHistory.length === 0 ? 'flex' : 'none';
    currentChatHistory.forEach(msg => { const msgDiv = appendMessage(msg.text, msg.sender, true, msg.files); });
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Convert file to base64 string
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Get MIME type for a file
function getMimeType(file) {
    const mimeMap = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'webm': 'video/webm'
    };
    if (file.type) return file.type;
    const ext = file.name.split('.').pop().toLowerCase();
    return mimeMap[ext] || 'application/octet-stream';
}

// Convert pending files to inline data for Gemini API
async function convertFilesToInlineData(files) {
    const inlineDataArray = [];
    const fileInfoArray = [];
    
    for (const fileItem of files) {
        const file = fileItem.file;
        const mimeType = getMimeType(file);
        
        // Only support images, PDFs, and videos for inline data
        const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/webm'];
        if (!supportedTypes.includes(mimeType)) {
            console.warn('[File] Skipping unsupported file type:', mimeType, file.name);
            continue;
        }
        
        try {
            const base64Data = await fileToBase64(file);
            inlineDataArray.push({
                mimeType: mimeType,
                data: base64Data
            });
            fileInfoArray.push({
                name: file.name,
                type: mimeType,
                size: file.size,
                preview: fileItem.preview
            });
        } catch (err) {
            console.error('[File] Failed to convert to base64:', file.name, err);
        }
    }
    
    return { inlineDataArray, fileInfoArray };
}

async function preprocessAndSend(text, files) {
    isProcessingFiles = true;
    setUploadingState(true);
    updateSendButton();
    
    try {
        // Convert files to base64 inline data
        const { inlineDataArray, fileInfoArray } = await convertFilesToInlineData(files);
        
        if (fileInfoArray.length === 0) {
            throw new Error('No supported files to process');
        }
        
        // Show ready message
        setUploadingState(false);
        isProcessingFiles = false;
        clearPendingFiles();
        
        // Send message with inline data
        await sendMessage(text, inlineDataArray, false, fileInfoArray);
    } catch (error) {
        console.error('[Preprocess] Error:', error);
        showToast('File processing error: ' + error.message, 'error');
        setUploadingState(false);
        isProcessingFiles = false;
        updateSendButton();
    }
}

async function sendMessage(text, inlineDataOrFiles = [], isRegenerate = false, processedFiles = null) {
    isGenerating = true;
    regenBtn.style.display = 'none'; stopBtn.style.display = 'flex';
    if (welcomeScreen.style.display !== 'none') welcomeScreen.style.display = 'none';
    chatContainer.scrollTop = chatContainer.scrollHeight;
    const botMsgDiv = appendMessage('', 'bot', false);
    const contentDiv = botMsgDiv.querySelector('.message-content');
    contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    abortController = new AbortController();
    let fullResponse = '';
    
    // Determine if we have files (inlineData array from preprocessAndSend or file objects from handleSend)
    const hasInlineData = Array.isArray(inlineDataOrFiles) && inlineDataOrFiles.length > 0 && inlineDataOrFiles[0].mimeType && inlineDataOrFiles[0].data;
    const hasFileObjects = Array.isArray(inlineDataOrFiles) && inlineDataOrFiles.length > 0 && inlineDataOrFiles[0].file;
    const hasFiles = hasInlineData || hasFileObjects || (processedFiles && processedFiles.length > 0);
    
    if (hasFiles) setUploadingState(true);
    try {
        let response;
        
        if (hasInlineData) {
            // Send with inline data (base64 encoded files)
            const requestBody = {
                message: text || '',
                sessionId: currentSessionId,
                userName: userName,
                userGender: userGender,
                userLocation: userLocation || '',
                model: 'gemini-2.5-flash',
                temperature: 0.7,
                inlineData: inlineDataOrFiles
            };
            
            console.log('[Chat] Sending message with inline data:', inlineDataOrFiles.length, 'files');
            // Log detailed info about each inline data item
            inlineDataOrFiles.forEach((item, idx) => {
                console.log(`  [${idx}] mimeType: ${item.mimeType}, dataSize: ${item.data.length} bytes, isBase64Valid: ${/^[A-Za-z0-9+/=]*$/.test(item.data)}`);
            });
            response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortController.signal
            });
        } else if (hasFileObjects) {
            // Send with FormData (old method with file preprocessing)
            const formData = new FormData();
            formData.append('message', text || '');
            formData.append('sessionId', currentSessionId);
            formData.append('userName', userName);
            formData.append('userGender', userGender);
            formData.append('userLocation', userLocation || '');
            formData.append('model', 'gemini-2.5-flash');
            formData.append('temperature', '0.7');
            
            for (const f of inlineDataOrFiles) {
                formData.append('files', f.file, f.name);
            }
            
            response = await fetch('/api/chat', {
                method: 'POST',
                body: formData,
                signal: abortController.signal
            });
        } else if (processedFiles && processedFiles.length > 0) {
            // Send with processed files (for backward compatibility)
            const formData = new FormData();
            formData.append('message', text || '');
            formData.append('sessionId', currentSessionId);
            formData.append('userName', userName);
            formData.append('userGender', userGender);
            formData.append('userLocation', userLocation || '');
            formData.append('model', 'gemini-2.5-flash');
            formData.append('temperature', '0.7');
            formData.append('processedFiles', JSON.stringify(processedFiles));
            
            response = await fetch('/api/chat', {
                method: 'POST',
                body: formData,
                signal: abortController.signal
            });
        } else {
            // Send text-only message
            response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    sessionId: currentSessionId,
                    userName,
                    userGender,
                    userLocation: userLocation || '',
                    model: 'gemini-2.5-flash',
                    temperature: 0.7
                }),
                signal: abortController.signal
            });
        }
        
        if (hasFiles) setUploadingState(false);
        if (!response.ok) {
            let errorMsg = 'Failed to get response';
            console.error('[Chat] ❌ HTTP Error:', response.status, response.statusText);
            try { 
                const errData = await response.json(); 
                console.error('[Chat] Error response:', errData);
                errorMsg = errData.error || errorMsg; 
            } catch(e) {
                console.error('[Chat] Could not parse error response:', e.message);
            }
            contentDiv.innerHTML = `<span style="color: #ef4444;">❌ Error: ${errorMsg}</span>`;
            fullResponse = errorMsg;
        } else {
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let done = false; let buffer = '';
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true }); buffer += chunk;
                    const lines = buffer.split('\n'); buffer = lines.pop();
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6);
                            if (dataStr === '[DONE]') { done = true; break; }
                            try {
                                const data = JSON.parse(dataStr);
                                if (data.text) {
                                    fullResponse += data.text;
                                    if (typeof OXYWidgetRenderer !== 'undefined' && OXYWidgetRenderer.looksLikeJSON(fullResponse)) { contentDiv.innerHTML = '<div class="widget-loading"><span class="widget-loading-dot"></span><span class="widget-loading-dot"></span><span class="widget-loading-dot"></span><span class="widget-loading-text">Building widget…</span></div>'; }
                                    else { const rawHtml = typeof marked !== 'undefined' ? marked.parse(fullResponse) : fullResponse; contentDiv.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml; formatCodeBlocks(contentDiv); }
                                    chatContainer.scrollTop = chatContainer.scrollHeight;
                                } else if (data.error) { contentDiv.innerHTML += `<br><span style="color: #ef4444;">❌ ${data.error}</span>`; }
                            } catch (parseErr) {}
                        }
                    }
                }
            }
        }
        if (!isRegenerate) { currentChatHistory.push({ text: fullResponse, sender: 'bot' }); saveSession(); }
        else if (isGenerating) { currentChatHistory.push({ text: fullResponse, sender: 'bot' }); saveSession(); }
    } catch (error) {
        if (hasFiles) setUploadingState(false);
        if (error.name === 'AbortError') { const stoppedMsg = fullResponse + '\n\n*(Stopped)*'; currentChatHistory.push({ text: stoppedMsg, sender: 'bot' }); saveSession(); fullResponse = stoppedMsg; }
        else {
            if (fullResponse) { const interruptedMsg = fullResponse + '\n\n*(Connection lost)*'; const rawHtml = typeof marked !== 'undefined' ? marked.parse(interruptedMsg) : interruptedMsg; contentDiv.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml; formatCodeBlocks(contentDiv); currentChatHistory.push({ text: interruptedMsg, sender: 'bot' }); saveSession(); fullResponse = interruptedMsg; }
            else { contentDiv.innerHTML = '<span style="color: #ef4444;">❌ Network error. Please try again.</span>'; fullResponse = 'Network error'; }
            console.error('Chat error:', error);
        }
    } finally {
        isGenerating = false; isProcessingFiles = false; 
        // Ensure uploading state is always reset and send button re-enabled
        setUploadingState(false);
        updateSendButton();
        stopBtn.style.display = 'none'; regenBtn.style.display = 'flex';
        if (fullResponse) { const widgetResult = typeof OXYWidgetRenderer !== 'undefined' ? OXYWidgetRenderer.detectAndRender(fullResponse) : null; if (widgetResult) contentDiv.innerHTML = `<div class="oxy-widget-container">${widgetResult.html}</div>`; else { const rawHtml = typeof marked !== 'undefined' ? marked.parse(fullResponse) : fullResponse; contentDiv.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml; formatCodeBlocks(contentDiv); } }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function stopGeneration() { if (abortController) { abortController.abort(); isGenerating = false; if (stopBtn) stopBtn.style.display = 'none'; if (regenBtn) regenBtn.style.display = 'flex'; saveSession(); } }
if (stopBtn) stopBtn.addEventListener('click', stopGeneration);
if (regenBtn) regenBtn.addEventListener('click', () => { if (currentChatHistory.length >= 2 && currentChatHistory[currentChatHistory.length - 1].sender === 'bot') { currentChatHistory.pop(); const lastUserMsg = currentChatHistory[currentChatHistory.length - 1]; renderHistory(); sendMessage(lastUserMsg.text, [], true); } });

if (messageInput) messageInput.addEventListener('input', function() {
    this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; this.style.overflowY = this.scrollHeight > 150 ? 'auto' : 'hidden'; updateSendButton();
});
if (messageInput) messageInput.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (sendBtn && !sendBtn.disabled && !isGenerating) handleSend(); } });
if (sendBtn) sendBtn.addEventListener('click', handleSend);

window.copyCode = function(btn) { const wrapper = btn.closest('.code-block-wrapper'); const code = wrapper.querySelector('code').innerText; navigator.clipboard.writeText(code).then(() => { btn.classList.add('copied'); const originalHtml = btn.innerHTML; btn.innerHTML = '<i class="fa-regular fa-clipboard"></i> Copied!'; setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = originalHtml; }, 2000); }); };
window.copyMessage = function(text) { navigator.clipboard.writeText(text).then(() => showToast('Message copied', 'success')).catch(() => showToast('Failed to copy', 'error')); };

window.editMessage = function(btn) {
    const msgDiv = btn.closest('.message'); const textEl = msgDiv.querySelector('.msg-text-content'); const originalText = textEl.textContent;
    const textarea = document.createElement('textarea'); textarea.className = 'msg-edit-textarea'; textarea.value = originalText; textarea.rows = 3;
    textEl.replaceWith(textarea); textarea.focus();
    const actionsDiv = msgDiv.querySelector('.message-actions');
    actionsDiv.innerHTML = `<button class="msg-action-btn msg-edit-save" onclick="saveEditedMessage(this)" title="Send"><i class="fa-solid fa-paper-plane"></i></button>
        <button class="msg-action-btn msg-edit-cancel" onclick="cancelEditMessage(this)" title="Cancel"><i class="fa-solid fa-xmark"></i></button>`;
    textarea.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditedMessage(btn.closest('.message').querySelector('.msg-edit-save')); } if (e.key === 'Escape') cancelEditMessage(btn.closest('.message').querySelector('.msg-edit-cancel')); });
};

window.saveEditedMessage = function(btn) {
    const msgDiv = btn.closest('.message'); const textarea = msgDiv.querySelector('.msg-edit-textarea'); const newText = textarea.value.trim();
    if (!newText) return;
    const msgIndex = Array.from(messagesWrapper.children).indexOf(msgDiv);
    if (msgIndex >= 0) { currentChatHistory.splice(msgIndex, currentChatHistory.length - msgIndex); renderHistory(); messageInput.value = newText; handleSend(); }
};

window.cancelEditMessage = function(btn) {
    const msgDiv = btn.closest('.message'); const textarea = msgDiv.querySelector('.msg-edit-textarea'); const originalText = textarea.value;
    const textEl = document.createElement('div'); textEl.className = 'msg-text-content'; textEl.textContent = originalText; textarea.replaceWith(textEl);
    const actionsDiv = msgDiv.querySelector('.message-actions');
    actionsDiv.innerHTML = `<button class="msg-action-btn" onclick="copyMessage('${originalText.replace(/'/g, '\\x27')}')" title="Copy"><i class="fa-regular fa-copy"></i></button>
        <button class="msg-action-btn" onclick="editMessage(this)" title="Edit"><i class="fa-solid fa-pen"></i></button>`;
};

window.sendSuggestion = function(text) { messageInput.value = text; updateSendButton(); handleSend(); };

function formatCodeBlocks(container) {
    const blocks = container.querySelectorAll('pre code');
    blocks.forEach((block) => {
        const pre = block.parentElement;
        if (!block.classList.contains('hljs')) {
            const langMatch = block.className.match(/language-(\w+)/); const lang = langMatch ? langMatch[1] : '';
            if (typeof hljs !== 'undefined') { try { block.setAttribute('data-highlighted', 'yes'); hljs.highlightElement(block); } catch (e) {} }
        }
        if (!pre.parentElement.classList.contains('code-block-wrapper')) {
            const classStr = block.className.replace('hljs', '').replace('language-', '').replace(/\s+/g, '').trim();
            const lang = classStr || 'code';
            const wrapper = document.createElement('div'); wrapper.className = 'code-block-wrapper';
            const header = document.createElement('div'); header.className = 'code-header';
            header.innerHTML = `<span>${lang}</span><button class="copy-btn" onclick="copyCode(this)"><i class="fa-regular fa-clipboard"></i> Copy</button>`;
            pre.parentNode.insertBefore(wrapper, pre); wrapper.appendChild(header); wrapper.appendChild(pre);
        }
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const isFirstInstall = navigator.serviceWorker.controller === null;
        navigator.serviceWorker.register('/service-worker.js').then(reg => { console.log('[SW] Registered with scope:', reg.scope); setInterval(() => reg.update(), 60 * 60 * 1000); }).catch(err => console.error('[SW] Registration failed:', err));
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) return; refreshing = true; if (!isFirstInstall) { console.log('[SW] New version activated. Reloading page for instant update...'); window.location.reload(); } });
    });
}

(function checkBackendHealth() {
    const bannerId = 'vosil-backend-banner';
    function showBanner(message) {
        if (document.getElementById(bannerId)) return;
        const banner = document.createElement('div'); banner.id = bannerId;
        banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 99999; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #fff; padding: 12px 20px; font-family: inherit; font-size: 14px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;';
        banner.innerHTML = `<strong>⚠️ ${message}</strong>`; document.body && document.body.appendChild(banner);
    }
    fetch('/api/health', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(data => { console.log('[Health] Backend OK on port', data.port, '— uptime', data.uptime.toFixed(0) + 's'); }).catch(err => { const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80); const host = window.location.hostname || 'localhost'; showBanner(`Backend not reachable at http://${host}:${port}. Run \`npm start\` in the project folder. (${err.message})`); });
})();

function initApp() {
    try {
        console.log('[App] Initializing VOSIL...');
        loadSessionsList(); initLocation();
        closeSidebar();
        if (!currentSessionId) createNewSession();
    } catch (err) {
        console.error('[App] Initialization error:', err);
    }
}

// Expose to window so the auth callback (in chat.html) can re-fetch after auth resolves
window.loadSessionsList = loadSessionsList;
window.updateWelcomeGreeting = updateWelcomeGreeting;

if (document.readyState === 'complete' || document.readyState === 'interactive') { initApp(); }
else { document.addEventListener('DOMContentLoaded', initApp); }