const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverFile, 'utf8');

const targetStart = `// ============================================================
// MAIN CHAT ENDPOINT
// ============================================================`;

const targetEnd = `// Multer error handler`;

const startIndex = content.indexOf(targetStart);
const endIndex = content.indexOf(targetEnd);

if (startIndex === -1 || endIndex === -1) {
    console.error('Target strings not found.');
    process.exit(1);
}

const replacement = `// ============================================================
// CONVERSATIONS & CHAT ENDPOINTS
// ============================================================

// GET /api/conversations - Get user's conversations
app.get('/api/conversations', requireUserAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, title, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
            [req.user.userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// GET /api/conversations/:id/messages - Get messages for a conversation
app.get('/api/conversations/:id/messages', requireUserAuth, async (req, res) => {
    try {
        const convoResult = await pool.query(
            'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.userId]
        );
        if (convoResult.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

        const msgResult = await pool.query(
            'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json(msgResult.rows.map(m => ({ role: m.role, text: m.content })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// PUT /api/conversations/:id - Rename a conversation
app.put('/api/conversations/:id', requireUserAuth, async (req, res) => {
    try {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        await pool.query(
            'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3',
            [title, req.params.id, req.user.userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to rename conversation' });
    }
});

// DELETE /api/conversations/:id - Delete a conversation
app.delete('/api/conversations/:id', requireUserAuth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});

// POST /api/chat - Main chat endpoint
app.post('/api/chat', optionalUserAuth, upload.array('files', 10), async (req, res) => {
    try {
        let message = req.body.message || '';
        let sessionId = req.body.sessionId;
        const userName = req.body.userName;
        const userGender = req.body.userGender || 'Prefer not to say';
        const userLocation = req.body.userLocation || req.body.location || '';
        const model = req.body.model || 'gemini-2.5-flash';
        const temperature = req.body.temperature || 0.7;
        const files = req.files || [];

        if (!message && files.length === 0) {
            return res.status(400).json({ error: 'Message or files required' });
        }

        if (!sessionId) {
            sessionId = 'sess_' + uuidv4().substring(0, 8);
        }

        if (sessionId) {
            if (files && files.length > 0) trackUserActivity(sessionId, 'upload');
            else trackUserActivity(sessionId, 'message');
        }

        const intent = detectIntent(message);
        storeInMemory(sessionId, 'lastIntent', intent);
        storeInMemory(sessionId, 'lastMessage', message.substring(0, 100));

        console.log(\`[Chat] session=\${sessionId} files=\${files.length} model=\${model}\`);

        // Web search runs BEFORE ambiguity check so time-sensitive queries
        // (e.g. "latest news", "what happened today") trigger search instead of
        // being blocked by the ambiguity detector asking "which time period?"
        let searchResults = null;
        let searchPerformed = false;
        const searchQuery = detectWebSearchIntent(message);
        if (searchQuery) {
            console.log(\`[Web Search] ✅ Intent detected | User query: "\${message}" | Search query: "\${searchQuery}"\`);
            searchResults = await performWebSearch(searchQuery);
            if (searchResults && searchResults.length > 0) {
                searchPerformed = true;
                console.log(\`[Web Search] ✅ Success | \${searchResults.length} result(s) returned for: "\${searchQuery}"\`);
                console.log(\`[Web Search] Results:\`, JSON.stringify(searchResults.map(r => ({ title: r.title, url: r.url })), null, 2));
                message = message + formatSearchResultsForAI(searchResults);
            } else {
                console.log(\`[Web Search] ⚠️ No results returned for: "\${searchQuery}"\`);
            }
        } else {
            console.log(\`[Web Search] ℹ️ No web search intent for: "\${message}"\`);
        }

        // Only check ambiguity when web search did NOT provide current information
        if (!searchPerformed) {
            const ambiguityResult = detectAmbiguity(message);
            if (ambiguityResult.isAmbiguous && ambiguityResult.clarifications.length > 0) {
                // For queries that ARE time-sensitive but ambiguity still fires (e.g. search returned 0 results),
                // don't block — let the model answer with what it knows
                const isTimeSensitive = /\b(latest|recent|current|today|now|this\s+week|trending|breaking|news|updates?|happened|happening)\b/i.test(message);
                if (!isTimeSensitive) {
                    return res.json({ text: ambiguityResult.clarifications[0], metadata: { type: 'clarification', ambiguity: ambiguityResult } });
                }
                console.log(\`[Web Search] ⚠️ Ambiguity detected but query is time-sensitive — proceeding without clarification\`);
            }
        }

        let dbHistory = [];
        if (req.user) {
            let convoResult = await pool.query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [sessionId, req.user.userId]);
            if (convoResult.rows.length === 0) {
                const title = (req.body.message || '').substring(0, 30) || 'New Chat';
                await pool.query('INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)', [sessionId, req.user.userId, title]);
            } else {
                await pool.query('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [sessionId]);
                const msgResult = await pool.query('SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [sessionId]);
                dbHistory = msgResult.rows.map(m => ({ role: m.role, parts: [{ text: m.content }] }));
            }
        }

        const now = new Date();
        const currentDateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const currentTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
        const currentYear = now.getFullYear();
        const dateContext = \`\\n\\nCURRENT DATE/TIME CONTEXT:\\nToday is \${currentDateStr}.\\nCurrent time: \${currentTimeStr}.\\nCurrent year: \${currentYear}.\\nIMPORTANT: The real current year is \${currentYear}, not 2024 or 2025.\`;
        const locationContext = userLocation ? \` The user's location is: \${userLocation}.\` : '';
        const genderContext = userGender !== 'Prefer not to say' ? \` The user has selected their gender as "\${userGender}".\` : '';
        const currentSystemPrompt = \`\${SYSTEM_PROMPT}\${dateContext}\\n\\nThe user is named "\${userName || 'User'}".\${locationContext}\${genderContext}\`;

        let historyToUse = [];
        if (req.user) {
            historyToUse = dbHistory;
        } else {
            let session = chatSessions.get(sessionId);
            if (session) historyToUse = session.history || [];
        }

        if (historyToUse.length === 0) {
            historyToUse = [{ role: "user", parts: [{ text: currentSystemPrompt }] }, { role: "model", parts: [{ text: "Understood." }] }];
            if (!req.user) {
                chatSessions.set(sessionId, { history: historyToUse, createdAt: Date.now() });
            }
        }

        const userParts = [];
        let fileDescriptions = [];

        if (files.length > 0) {
            const { parts: fileParts, fileDescriptions: descs } = await buildFileParts(files);
            userParts.push(...fileParts);
            fileDescriptions = descs;
        }

        if (message) userParts.push({ text: message });
        else if (files.length > 0) userParts.push({ text: 'Please analyze the attached file(s).' });

        const historyText = [message, ...fileDescriptions].filter(Boolean).join('\\n');
        
        if (req.user) {
            await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [sessionId, 'user', historyText]);
        }
        
        historyToUse.push({ role: "user", parts: [{ text: historyText }] });
        const contents = [...historyToUse.slice(0, -1), { role: "user", parts: userParts }];

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const { stream: responseStream, model: usedModel, keyIndex, attempts } = await requestQueue.enqueue(() =>
            executeWithRetry({ model, contents, config: { systemInstruction: currentSystemPrompt, temperature: parseFloat(temperature) } }, true)
        );

        let fullReply = '';
        try {
            for await (const chunk of responseStream) {
                const chunkText = chunk.text;
                if (chunkText) { fullReply += chunkText; if (!safeSseWrite(res, `data: ${JSON.stringify({ text: chunkText })}\n\n`)) break; }
            }
        } catch (streamErr) {
            console.error('[Chat] Stream error:', streamErr);
            if (isTransientError(streamErr) || streamErr.status === 503) {
                 safeSseWrite(res, `data: ${JSON.stringify({ error: "Service temporarily unavailable, please retry." })}\n\n`);
            } else {
                 safeSseWrite(res, `data: ${JSON.stringify({ error: "An error occurred during streaming." })}\n\n`);
            }
        }

        if (req.user) {
            await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [sessionId, 'model', fullReply || '[No response generated]']);
        }
        historyToUse.push({ role: "model", parts: [{ text: fullReply || '[No response generated]' }] });
        
        if (!req.user) {
            const session = chatSessions.get(sessionId);
            if (session) session.history = historyToUse;
        }

        safeSseWrite(res, \`data: \${JSON.stringify({ text: '', done: true, sessionId })}\\n\\n\`);
        safeSseEnd(res);

    } catch (error) {
        console.error('Chat Endpoint Error:', error.message?.substring(0, 200));
        const allKeysExhausted = error.allKeysExhausted === true || (error.message && error.message.includes('All API keys exhausted'));

        let errorMsg;
        if (allKeysExhausted) {
            errorMsg = '⚠️ All API keys are temporarily busy. Please try again in a moment.';
        } else if (error.status === 503 || (error.message && error.message.includes('503'))) {
            errorMsg = '⚠️ AI model temporarily overloaded. Please try again.';
        } else if (isRateLimitError(error)) {
            errorMsg = '⚠️ Service is busy. Please try again in a moment.';
        } else {
            errorMsg = 'An error occurred while processing your request. Please try again.';
        }
        if (!res.headersSent) res.status(503).json({ error: errorMsg });
        else { try { res.write(\`data: \${JSON.stringify({ error: errorMsg })}\\n\\n\`); res.end(); } catch {} }
    }
});

`;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(serverFile, content, 'utf8');
console.log('Successfully patched server.js');
