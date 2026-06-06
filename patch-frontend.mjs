import fs from 'fs';
let content = fs.readFileSync('public/app.js', 'utf8');

if (!content.includes('function preprocessAndSend')) {
  const preprocessFunc = `
// === PREPROCESS FILES + AUTO-SEND (ChatGPT/Gemini-style upload) ===
async function preprocessAndSend(text, files) {
    isProcessingFiles = true;
    setUploadingState(true);
    updateSendButton();

    const filesForHistory = files.map(f => {
        addRecentFile({ name: f.name, type: f.type, size: f.size });
        return { name: f.name, type: f.type, size: f.size, preview: f.preview };
    });

    currentChatHistory.push({ text, sender: 'user', files: filesForHistory });
    renderHistory();

    const botMsgDiv = appendMessage('', 'bot', false);
    const contentDiv = botMsgDiv.querySelector('.message-content');

    // Build per-file progress indicators
    const fileItems = files.map(f => '<div class="file-progress-item" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #2a2a3a;"><div class="file-progress-spinner" style="width:18px;height:18px;border:2px solid #2a2a3a;border-top-color:#a855f7;border-radius:50%;animation:spin 0.6s linear infinite;flex-shrink:0;"></div><div style="flex:1;min-width:0;"><div style="color:#e8e8ed;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + f.name + '</div><div class="file-progress-status" style="color:#8a8a9a;font-size:12px;">Queued...</div></div><span class="file-progress-pct" style="color:#8a8a9a;font-size:12px;flex-shrink:0;">0%</span></div>').join('');

    contentDiv.innerHTML = '<div style="padding:12px;"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;"><div class="typing-indicator" style="display:inline-flex;"><span></span><span></span><span></span></div><span style="color:#8a8a9a;font-size:14px;">Processing files...</span></div><div class="file-progress-list">' + fileItems + '</div></div>';

    if (!document.getElementById('oxy-upload-style')) {
        const style = document.createElement('style');
        style.id = 'oxy-upload-style';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }

    function updateFileProgress(name, status, progress, isError, errorMsg) {
        const items = contentDiv.querySelectorAll('.file-progress-item');
        let item = null;
        for (const el of items) {
            if (el.textContent.includes(name)) { item = el; break; }
        }
        if (!item) return;
        const spinner = item.querySelector('.file-progress-spinner');
        const statusEl = item.querySelector('.file-progress-status');
        const pctEl = item.querySelector('.file-progress-pct');

        if (isError) {
            if (spinner) { spinner.style.borderTopColor = '#ef4444'; spinner.style.animation = 'none'; spinner.style.border = '2px solid #ef4444'; }
            if (statusEl) statusEl.textContent = errorMsg ? 'X ' + errorMsg : 'X Failed';
            if (pctEl) pctEl.textContent = 'Failed';
        } else if (status === 'ready' || progress >= 100) {
            if (spinner) { spinner.style.borderTopColor = '#22c55e'; spinner.style.animation = 'none'; spinner.style.border = '2px solid #22c55e'; }
            if (statusEl) statusEl.textContent = 'Ready';
            if (pctEl) pctEl.textContent = '100%';
        } else if (status === 'uploading') {
            if (statusEl) statusEl.textContent = 'Uploading...';
            if (pctEl) pctEl.textContent = (progress || 0) + '%';
        } else if (status === 'processing') {
            if (statusEl) statusEl.textContent = 'Processing... ' + (progress || 0) + '%';
            if (pctEl) pctEl.textContent = (progress || 0) + '%';
        } else {
            if (statusEl) statusEl.textContent = status || 'Waiting...';
            if (pctEl) pctEl.textContent = (progress || 0) + '%';
        }
    }

    try {
        const formData = new FormData();
        for (const f of files) { formData.append('files', f.file, f.name); }

        const response = await fetch('/api/preprocess-files', { method: 'POST', body: formData });

        if (!response.ok) throw new Error('Preprocessing failed (HTTP ' + response.status + ')');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        const processedData = [];

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();

            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(line.substring(6));
                    if (data.done) break;
                    if (data.name) {
                        if (data.status === 'saved') updateFileProgress(data.name, 'saved', 0);
                        else if (data.status === 'uploading') updateFileProgress(data.name, 'uploading', data.progress || 0);
                        else if (data.status === 'processing') updateFileProgress(data.name, 'processing', data.progress || 0);
                        else if (data.status === 'ready') { updateFileProgress(data.name, 'ready', 100); processedData.push(data); }
                        else if (data.status === 'failed') { updateFileProgress(data.name, 'failed', 0, true, data.error || 'Processing failed'); }
                    }
                } catch (e) {}
            }
        }

        const readyFiles = processedData.filter(d => d.status === 'ready');
        if (readyFiles.length === 0) throw new Error('All files failed to process');

        if (contentDiv) {
            contentDiv.innerHTML = '<div style="padding:10px;color:#8a8a9a;font-size:13px;"><span style="color:#22c55e;">V</span> ' + readyFiles.length + ' file(s) ready' + (processedData.length > readyFiles.length ? ' (' + (processedData.length - readyFiles.length) + ' failed)' : '') + '</div>';
        }

        setUploadingState(false);
        isProcessingFiles = false;
        await sendMessage(text, [], false, processedData);

    } catch (error) {
        console.error('[Preprocess] Error:', error);
        if (contentDiv) { contentDiv.innerHTML = '<span style="color:#ef4444;padding:12px;">X File processing error: ' + error.message + '</span>'; }
        setUploadingState(false);
        isProcessingFiles = false;
        updateSendButton();
    }
}
`;

  content = content.replace('async function sendMessage(text, files, isRegenerate = false) {', preprocessFunc + '\n\nasync function sendMessage(text, files, isRegenerate = false, processedFiles = null) {');
  content = content.replace('    const hasFiles = files && files.length > 0;\n    if (hasFiles) setUploadingState(true);', '    const hasFiles = (files && files.length > 0) || (processedFiles && processedFiles.length > 0);\n    if (hasFiles) setUploadingState(true);');
  content = content.replace('formData.append(\'temperature\', \'0.7\');\n            for (const f of files) {\n                formData.append(\'files\', f.file, f.name);\n            }', 'formData.append(\'temperature\', \'0.7\');\n            if (processedFiles && processedFiles.length > 0) {\n                formData.append(\'processedFiles\', JSON.stringify(processedFiles));\n            } else {\n                for (const f of files) {\n                    formData.append(\'files\', f.file, f.name);\n                }\n            }');
  content = content.replace('isGenerating = false;\n            stopBtn.style.display', 'isGenerating = false;\n            isProcessingFiles = false;\n            stopBtn.style.display');

  fs.writeFileSync('public/app.js', content);
  console.log('SUCCESS: preprocessAndSend added, sendMessage updated');
} else {
  console.log('Already patched');
}