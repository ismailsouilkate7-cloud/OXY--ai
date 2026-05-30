import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = pdfParseModule.default || pdfParseModule;
import JSZip from 'jszip';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import compression from 'compression';
import fs from 'fs';
import DDG from 'duck-duck-scrape';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ============================================================
// GLOBAL ERROR HANDLING — prevents server crashes on network errors
// ============================================================

// Catch unhandled promise rejections (e.g., network timeouts, DNS failures)
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global] ❌ Unhandled Rejection at:', promise, 'reason:', reason?.message || reason);
    // Do NOT exit — the server stays alive
});

// Catch uncaught exceptions (e.g., unexpected runtime errors)
process.on('uncaughtException', (err) => {
    console.error('[Global] ❌ Uncaught Exception:', err.message);
    // Log full stack for debugging, but keep server running
    console.error('[Global] Stack:', err.stack?.substring(0, 500));
    // Do NOT exit — the server stays alive
});

// Safe SSE write helper — prevents crashes when client disconnects mid-stream
function safeSseWrite(res, data) {
    try {
        if (res && !res.destroyed && res.writable) {
            res.write(data);
            return true;
        }
    } catch (err) {
        // Client likely disconnected — this is non-fatal
        console.log('[SSE] Client disconnected (write failed):', err.message?.substring(0, 80));
    }
    return false;
}

// Safe SSE end helper — prevents crashes on premature connection close
function safeSseEnd(res) {
    try {
        if (res && !res.destroyed && res.writable) {
            res.end();
        }
    } catch (err) {
        // Non-fatal — client already gone
    }
}

// Graceful server error handling (port conflicts, permission errors, etc.)
function startServer(app, port, retries = 3) {
    const attempt = (tryCount) => {
        const server = app.listen(port, () => {
            console.log(`🚀 OXY AI Server running on http://localhost:${port}`);
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                if (tryCount < retries) {
                    const waitMs = 2000;
                    console.warn(`[Server] ⚠️ Port ${port} in use, retrying in ${waitMs}ms... (attempt ${tryCount + 1}/${retries})`);
                    setTimeout(() => attempt(tryCount + 1), waitMs);
                } else {
                    console.error(`[Server] ❌ Port ${port} still in use after ${retries} retries. Please free the port or change PORT in .env`);
                    process.exit(1);
                }
            } else {
                console.error('[Server] ❌ Failed to start:', err.message);
                process.exit(1);
            }
        });
    };
    attempt(0);
}
const port = process.env.PORT || 3000;

// Increase JSON body limit for base64 payloads
app.use(express.json({ limit: '50mb' }));

// Use gzip compression for responses
app.use(compression());

// Serve static files with caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d' // 1 day caching
}));

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// CORS headers for Vercel deployment
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Allowed MIME types

const ALLOWED_MIMES = new Set([
    // Images
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
    // Videos
    'video/mp4', 'video/quicktime', 'video/webm',
    // Documents
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
    'application/json', 'text/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/zip', 'application/x-zip-compressed',
    // Code files (sent as text/plain or application/octet-stream)
    'application/javascript', 'text/javascript', 'text/html', 'text/css',
    'text/x-python', 'text/x-java-source', 'text/x-c', 'text/x-c++src',
    'application/typescript', 'application/octet-stream',
]);

// Extensions we'll accept even if MIME is octet-stream
const CODE_EXTENSIONS = new Set([
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
    '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.md', '.txt',
    '.csv', '.sh', '.rb', '.go', '.rs', '.php', '.sql', '.r', '.swift',
    '.kt', '.vue', '.svelte',
]);

// Multer config — memory storage (Vercel compatible, no disk writes)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB per file (video needs more)
        files: 10, // max 10 files per request
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();

        // Fix MIME type for code files sent as octet-stream
        if (file.mimetype === 'application/octet-stream' && CODE_EXTENSIONS.has(ext)) {
            const detectedMime = mime.lookup(ext) || 'text/plain';
            file.mimetype = detectedMime;
            return cb(null, true);
        }

        if (ALLOWED_MIMES.has(file.mimetype) || file.mimetype.startsWith('text/')) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype} (${file.originalname})`), false);
        }
    }
});

// ============================================================
// CONVERSATION MEMORY HELPERS
// ============================================================

const CONVERSATION_MEMORY = new Map();
const MEMORY_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const MEMORY_MAX_CONTEXT = 2000; // Max characters to retrieve

function storeInMemory(sessionId, key, value) {
    if (!CONVERSATION_MEMORY.has(sessionId)) {
        CONVERSATION_MEMORY.set(sessionId, {});
    }
    const memory = CONVERSATION_MEMORY.get(sessionId);
    memory[key] = {
        value,
        timestamp: Date.now()
    };
}

function getFromMemory(sessionId, key) {
    const memory = CONVERSATION_MEMORY.get(sessionId);
    if (!memory || !memory[key]) return null;
    if (Date.now() - memory[key].timestamp > MEMORY_MAX_AGE) {
        delete memory[key];
        return null;
    }
    return memory[key].value;
}

function getConversationContext(sessionId, limit = 10) {
    const history = chatSessions.get(sessionId);
    if (!history || !history.history) return [];
    return history.history
        .filter(msg => msg.role === 'user')
        .slice(-limit)
        .map(msg => msg.parts?.[0]?.text || '')
        .join('\n')
        .substring(0, MEMORY_MAX_CONTEXT);
}

// ============================================================
// INTENT DETECTION SYSTEM
// ============================================================

function detectIntent(message, searchResults = null) {
    if (!message) return { type: 'unknown', confidence: 0, entities: [] };

    const msg = message.toLowerCase().trim();
    const intent = {
        type: 'unknown',
        confidence: 0,
        entities: [],
        requiresSearch: false,
        requiresVisualization: false,
        isTimeSensitive: false
    };

    // Weather intent
    if (/\b(weather|forecast|temperature|rain|sunny|cloudy|climate)\b/i.test(msg)) {
        intent.type = 'weather';
        intent.confidence = 0.95;
        intent.requiresSearch = !searchResults;
        intent.requiresVisualization = !!searchResults;
    }
    // News intent
    else if (/\b(news|breaking|happened|announcement|update)\b/i.test(msg)) {
        intent.type = 'news';
        intent.confidence = 0.9;
        intent.requiresSearch = !searchResults;
        intent.isTimeSensitive = true;
    }
    // Sports intent
    else if (/\b(score|match|game|result|standings?|tournament|championship)\b/i.test(msg)) {
        intent.type = 'sports';
        intent.confidence = 0.85;
        intent.requiresSearch = !searchResults;
        intent.requiresVisualization = !!searchResults;
    }
    // Finance intent
    else if (/\b(stock|price|bitcoin|crypto|market|exchange\s+rate|inflation)\b/i.test(msg)) {
        intent.type = 'finance';
        intent.confidence = 0.85;
        intent.requiresSearch = !searchResults;
        intent.requiresVisualization = !!searchResults;
    }
    // Education intent
    else if (/\b(exam|schedule|registration|deadline|university|school)\b/i.test(msg)) {
        intent.type = 'education';
        intent.confidence = 0.8;
        intent.requiresSearch = !searchResults;
        intent.isTimeSensitive = true;
    }

    // Extract entities (dates, locations, names)
    const dateMatches = message.match(/\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-\d{2,4}]|today|yesterday|tomorrow|next|this\s+(?:week|month|year|january|february|march|april|may|june|july|august|september|october|november|december))/gi);
    if (dateMatches) intent.entities.push(...dateMatches);

    const locationMatches = message.match(/\b(?:in|at|for|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
    if (locationMatches) intent.entities.push(...locationMatches);

    return intent;
}

// ============================================================
// AMBIGUITY DETECTION SYSTEM
// ============================================================

function detectAmbiguity(message) {
    if (!message) return { isAmbiguous: false, reasons: [], clarifications: [] };

    const msg = message.toLowerCase().trim();
    const reasons = [];
    const clarifications = [];

    // Time ambiguity
    const timeAmbiguous = ['upcoming', 'recent', 'latest', 'current', 'today', 'now']
        .filter(w => msg.includes(w));
    if (timeAmbiguous.length > 0 && !msg.match(/\b\d{4}\b/)) {
        reasons.push('time context missing');
        clarifications.push('Could you specify the time period you\'re interested in?');
    }

    // Location ambiguity
    const locationIndicated = msg.match(/\b(?:in|at|from|for)\s+(?:my|our|the)\s+(?:area|region|country|city)\b/i);
    const locationMissing = msg.match(/\b(?:weather|news|price|population|event)\b/i);
    if (locationIndicated && locationMissing) {
        reasons.push('location context needed');
        clarifications.push('What location are you referring to?');
    }

    // Event context ambiguity
    const eventWords = ['exam', 'score', 'result', 'price', 'schedule'];
    const hasEventWord = eventWords.some(w => msg.includes(w));
    const missingContext = msg.match(new RegExp('\\b\\d+\\/\\d+\\b')); // e.g., "24/25" without context
    if (hasEventWord && missingContext && !msg.match(/(?:academic|school|year|season)/i)) {
        reasons.push('numeric reference lacks context');
        clarifications.push(`"Does "${missingContext[0]}" refer to an academic year, a ratio, or something else?`);
    }

    // Sports/team ambiguity
    const sportsTeams = ['real', 'barca', 'united', 'city', 'arsenal', 'liverpool', 'manchester'];
    const hasSportsTeam = sportsTeams.some(t => msg.includes(t));
    const hasSportsContext = msg.match(/(?:score|match|game|result|vs|against)/i);
    if (hasSportsTeam && !hasSportsContext) {
        reasons.push('potentially missing sports context');
        clarifications.push('Are you asking about sports? If so, which sport?');
    }

    // Check for vague pronouns without clear antecedent
    if (msg.match(/^(?:it|they|this|that|what|how|why)\b/i) && msg.split(/\s+/).length < 8) {
        const hasHistory = msg.match(/^(?:it|they|this|that|what|how|why)\s+(?:is|are|was|were|did|does|do|can|will|would|should)/i);
        if (hasHistory) {
            reasons.push('reference to previous context unclear');
            clarifications.push('Could you clarify what you\'re referring to?');
        }
    }

    return {
        isAmbiguous: reasons.length > 0,
        reasons: [...new Set(reasons)],
        clarifications: [...new Set(clarifications)]
    };
}

// ============================================================
// ANTI-HALLUCINATION CHECKS
// ============================================================

function validateAgainstSources(response, searchSources = null, originalQuery = '') {
    if (!response) return { isValid: true, issues: [] };

    const issues = [];
    const evidenceMarkers = {
        hasSearchContext: searchSources && searchSources.length > 0,
        hasSourceCitation: /\[\d+\]/.test(response) || /source|according to/i.test(response.toLowerCase()),
        hasDateClaim: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,4}\b/gi.test(response),
        hasSpecificClaim: /\b(?:exactly|precisely|specifically|always|never|all|every)\b/i.test(response),
        hasConfidenceWithoutEvidence: /(?:i (?:know|am sure|am certain)|definitely|absolutely|no doubt|without a doubt)/i.test(response),
        hasNumericClaim: /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|million|billion|thousand|people|users|cases|\$|€|£|km|miles|kg|lb|hours|minutes|seconds)/gi.test(response),
        hasPercentage: /\b\d+(?:\.\d+)?\s*%\b/.test(response),
        hasRankingClaim: /(?:rank|top|best|worst|number one|first place|winner|champion)/i.test(response),
        hasPersonClaim: /(?:president|prime minister|ceo|director|leader|founder|inventor|scientist|author|artist)\s+(?:is|was|of)/i.test(response),
        hasLocationClaim: /(?:capital|located|based|headquartered)\s+(?:in|at|of)/i.test(response),
    };

    // Flag date claims without search sources
    if (evidenceMarkers.hasDateClaim && !evidenceMarkers.hasSearchContext) {
        issues.push({
            severity: 'high',
            type: 'date_without_source',
            message: 'Date claim made without verified search sources'
        });
    }

    // Flag numeric claims without search sources
    if (evidenceMarkers.hasNumericClaim && !evidenceMarkers.hasSearchContext) {
        const nums = response.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|million|billion|thousand|people|users|cases|\$|€|£|km|miles|kg|lb|hours|minutes|seconds)/gi) || [];
        issues.push({
            severity: 'medium',
            type: 'numeric_without_source',
            message: `Numeric claim (${nums[0]}) without verified sources`,
            values: nums
        });
    }

    // Flag ranking claims without search sources
    if (evidenceMarkers.hasRankingClaim && !evidenceMarkers.hasSearchContext) {
        issues.push({
            severity: 'medium',
            type: 'ranking_without_source',
            message: 'Ranking claim without verified sources'
        });
    }

    // Flag person/location claims without search sources for time-sensitive topics
    const timeSensitiveTopics = ['president', 'prime minister', 'election', 'population', 'price', 'stock'];
    const hasTimeSensitive = timeSensitiveTopics.some(t => originalQuery.toLowerCase().includes(t));
    if (hasTimeSensitive && (evidenceMarkers.hasPersonClaim || evidenceMarkers.hasLocationClaim) && !evidenceMarkers.hasSearchContext) {
        issues.push({
            severity: 'high',
            type: 'time_sensitive_claim_without_source',
            message: 'Time-sensitive factual claim without verified sources'
        });
    }

    // Flag confidence without evidence for claims
    if (evidenceMarkers.hasConfidenceWithoutEvidence && !evidenceMarkers.hasSourceCitation) {
        issues.push({
            severity: 'low',
            type: 'confidence_without_evidence',
            message: 'Confident statement without evidence markers'
        });
    }

    return {
        isValid: issues.length === 0,
        issues,
        evidenceMarkers
    };
}

// ============================================================
// SOURCE VERIFICATION
// ============================================================

function extractSourcesFromResponse(response, searchResults = null) {
    const sources = [];

    // Extract citations from response [1], [2], etc.
    const citationMatches = response.match(/\[(\d+)\]/g) || [];

    // Extract URLs from response
    const urlMatches = response.match(/https?:\/\/[^\s\]\)}]+/gi) || [];

    // Add search results as sources
    if (searchResults && Array.isArray(searchResults)) {
        for (const result of searchResults) {
            if (result.url && !sources.some(s => s.url === result.url)) {
                sources.push({
                    url: result.url,
                    title: result.title || 'Unknown',
                    description: result.description || '',
                    verified: true
                });
            }
        }
    }

    // Add extracted URLs
    for (const url of urlMatches) {
        if (!sources.some(s => s.url === url)) {
            sources.push({
                url,
                title: 'Provided in response',
                verified: false
            });
        }
    }

    // Verify citations map to search results
    const verifiedCitations = [];
    for (const cite of citationMatches) {
        const num = parseInt(cite.replace(/[\[\]]/g, ''));
        if (searchResults && searchResults[num - 1]) {
            verifiedCitations.push({
                citation: cite,
                source: searchResults[num - 1],
                valid: true
            });
        }
    }

    return {
        sources,
        citations: verifiedCitations,
        hasVerifiedSources: sources.some(s => s.verified),
        sourceCount: sources.length
    };
}

// ============================================================
// WEB SEARCH DECISION MAKING
// ============================================================

function shouldPerformWebSearch(message, intent, searchResults = null) {
    // Already have results
    if (searchResults && searchResults.length > 0) return { needsSearch: false, reason: 'existing_results' };

    // Intent-based decision
    if (intent.requiresSearch && intent.confidence > 0.7) {
        return { needsSearch: true, reason: 'intent_requires_search' };
    }

    // Time-sensitive topics
    const timeSensitive = ['today', 'now', 'current', 'latest', 'live', 'real-time'];
    const msg = message.toLowerCase();
    const hasTimeSensitive = timeSensitive.some(t => msg.includes(t));
    const hasSensitiveTopic = ['exam', 'price', 'score', 'stock', 'weather', 'news', 'election'].some(t => msg.includes(t));

    if (hasTimeSensitive && hasSensitiveTopic) {
        return { needsSearch: true, reason: 'time_sensitive_topic' };
    }

    // Uncertainty detection
    const uncertaintyMarkers = ['don\'t know', 'not sure', 'couldn\'t find', 'no information', 'might', 'possibly'];
    const explicitSearchRequest = msg.match(/(?:search|lookup|find|look up|latest|current)/i);

    if (explicitSearchRequest && !searchResults) {
        return { needsSearch: true, reason: 'explicit_request' };
    }

    return { needsSearch: false, reason: 'confidence_low_or_no_results_needed' };
}

// ============================================================
// AUTOMATIC AMBIGUITY HANDLING
// ============================================================

function handleAmbiguity(message, ambiguityResult, sessionHistory = []) {
    if (!ambiguityResult.isAmbiguous) return null;

    // Get last user message for context
    const lastUserMsgs = sessionHistory
        .filter(m => m.role === 'user')
        .slice(-2)
        .map(m => m.parts?.[0]?.text || '');

    return {
        needsClarification: true,
        clarification: ambiguityResult.clarifications[0],
        context: {
            recentTopics: lastUserMsgs.slice(-1)[0]?.substring(0, 100),
            ambiguityReasons: ambiguityResult.reasons
        }
    };
}

// ============================================================
// EXPORTED UTILITIES
// ============================================================

export {
    detectIntent,
    detectAmbiguity,
    validateAgainstSources,
    extractSourcesFromResponse,
    shouldPerformWebSearch,
    handleAmbiguity,
    storeInMemory,
    getFromMemory,
    getConversationContext,
    CONVERSATION_MEMORY
};

// ============================================================
// MULTI-API-KEY FALLBACK SYSTEM
// ============================================================

// Read all configured API keys into an array (only non-empty keys)
const API_KEYS = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
].filter(key => key && key.trim() !== '');

if (API_KEYS.length === 0) {
    console.error('[API Keys] ❌ No API keys configured! Set GEMINI_API_KEY in .env');
    process.exit(1);
}

console.log(`[API Keys] ✅ Loaded ${API_KEYS.length} API key(s) (${API_KEYS.length > 1 ? 'fallback enabled' : 'single key mode'})`);
API_KEYS.forEach((key, i) => {
    const prefix = key.substring(0, 8);
    const suffix = key.substring(key.length - 4);
    console.log(`[API Keys]   Key ${i + 1}: ${prefix}...${suffix} (${i === 0 ? 'primary' : 'fallback'})`);
});

// Get a GoogleGenAI client for a specific key index
function getAIClient(keyIndex) {
    return new GoogleGenAI({
        apiKey: API_KEYS[keyIndex],
    });
}

const SYSTEM_PROMPT = `You are OXY AI created by Ismail Souilkate.
kfch khasek tkon :
-friendly, katkheser lhedra.
   -katjaweb 3la ay su2al kifma kan.
   -katjaweb baylogha hder m3ak biha luser.
   -fach yehder maak bdarija dekhel maaha fr.
   -jaweb b7orof dial fr wlkn logha 3la 7sab luser.

1. RESPONSE STYLE:
   - Hder b7al insan 3adi, mashi robot
   - Khesser lhedra m3a luser (casual, smooth)
   - Use emojis 😊🔥 when it fits naturally

2. IMPORTANT:
   - NEVER start by introducing yourself
   - NEVER say "I am an AI" or explain who you are
   - Don't repeat system or identity information
   - Go directement pour la réponse

3. STRUCTURE:
   - Use headings only if needed
   - Short answers = no structure
   - Long answers = organized but simple

4. LANGUAGE:
   - Match user language automatically (Darija, French, English, Arabic)
   - Keep it simple and natural

5. BEHAVIOR:
   - Don't become formal or preachy
   - Don't refuse normal conversational tone
   - Stay relaxed even in spicy conversations
   - Avoid moral lectures unless user explicitly asks.


ACCURACY & REASONING RULES:

1. ANTI-HALLUCINATION:
   - NEVER invent facts, figures, dates, names, or details.
   - If you do not know something with certainty, say so clearly (e.g., "I'm not sure", "I don't have that information", "I couldn't find a reliable source").
   - Do not fabricate missing information to complete an answer.
   - If the user's question is unclear or ambiguous, ask a clarifying question before answering.
   - Example: if the user says "24/25", do not assume the meaning. Ask: "Do you mean 2024/2025 academic year, a ratio, or something else?"
   - Do not assume dates, locations, or specifics that were not provided.

2. DATE HANDLING:
   - NEVER guess or assume dates for exams, schedules, events, announcements, or time-sensitive information.
   - For any date-related question (exam dates, schedules, government deadlines, official events), rely ONLY on web search results.
   - If web search did not return a verified date, state that you could not find the exact date rather than making one up.
   - Provide dates only when they are confirmed by the search results appended to the message.

3. AMBIGUITY DETECTION:
   - If a message has multiple possible interpretations, ask the user to clarify.
   - If a term is ambiguous (e.g., "result", "score", "match" could refer to sports, exams, or other contexts), ask for specifics.
   - If the user's question lacks necessary context (e.g., missing location, time, name), ask for it.
   - When asking clarifying questions, be brief and specific.

4. RESPONSE QUALITY:
   - Prioritize accuracy over confidence. A correct "I don't know" is better than a confident wrong answer.
   - If a topic requires current information but web search did not provide clear results, explain what is known and what is uncertain.
   - Do not generate false details, examples, or statistics to pad an answer.
   - When answering, only include the information you are confident about.

ADD-ON RULES:

- Always detect user intent before answering.
- If the user asks for weather, analysis, statistics, comparisons, or anything that can be visualized, return a structured JSON response for UI rendering.
- If visualization is not needed, respond normally in text.

- When using widgets, output ONLY JSON in this format:
{
  "type": "widget_type",
  "title": "string",
  "location": "user's location if available",
  "data": {},
  "insights": [],
  "recommendation": "string"
}

- For weather widgets specifically, ALWAYS include the "location" field with the user's location (city name or city,country format). If user location is provided in context, use it. If not provided, ask the user for their location or use "Current Location" as fallback.

- Do not force widgets for every message.
- The frontend is responsible for rendering UI. You only provide data or text depending on intent.
- Do not change or remove any existing behavior in this system prompt.

SEARCH PRIORITY RULES:
- When web search results are appended to the user's message (in the "--- Web Search Results ---" section), those results take priority over your internal knowledge.
- If the search results contain an exact, clear answer to the user's question, return it directly. Do NOT say "I don't know", "I'm not sure", "based on my knowledge", or give estimated/guessed information.
- If search results are provided, use them as your primary source of truth. Only fall back to your training data if the search results are empty, irrelevant, or clearly insufficient.
- Always return the most current and specific information available from the search results.
- For date-specific queries (exam dates, schedules, official deadlines, events), the search results are the ONLY acceptable source. Do NOT use your training data for dates.
- If a web search was attempted but no results were found or the search failed, answer normally using your training data. Mention that live data could not be verified if it's relevant to the answer.
- The system automatically decides when to search — you do not need to be asked. Just use whatever context is provided.

IMPORTANT:
When returning widget responses or structured data, output ONLY valid JSON.
Do not add introductions, explanations, markdown, greetings, or any text before or after the JSON.
The response must start with { and end with } only.

FORMATTING & RESPONSE STRUCTURE (additive improvements — do NOT remove existing rules above):

6. RESPONSE FORMAT:
   - Use clear markdown headings (## or ###) for multi-section answers to improve readability.
   - For short answers (1-3 sentences), keep plain text without headings — no need to over-format.
   - Add a blank line before and after headings for clean spacing.
   - Use **bold** for key terms, numbers, dates, names, and important highlights.
   - Use bullet points (• or -) for lists and itemized information.
   - Use numbered lists for step-by-step instructions or ranked items.
    - When appropriate, use code blocks (triple backticks) for code, commands, or structured data.
   - Keep paragraphs short (2-4 sentences max) for readability.
   - Use a clean visual hierarchy: heading → subheading → body text → bullet details.

7. RESPONSE STRUCTURE (long answers):
   - Start with a brief friendly opener (2-3 words max) if it feels natural, or dive directly into the content.
   - Organize information logically: most important point first, then supporting details.
   - If providing multiple options/comparisons, use a table or bullet points.
   - End with a brief closing line or question to keep the conversation flowing (optional, don't force it).
   - For explanations, use: "**The short answer:** ..." then "**Details:** ..." pattern.
   - For comparisons, use clear section headers like "**Advantages**" / "**Disadvantages**" or side-by-side lists.

8. MODERN CHAT STYLE:
   - Keep the tone casual and direct — write like a knowledgeable friend, not a textbook.
   - Use emojis naturally to add warmth, but don't overdo it (1-2 per message max unless listing).
   - When sharing data/statistics, present them cleanly with bold numbers and clear formatting.
   - For error/invalid states, be clear and helpful without being apologetic or robotic.
   - Avoid walls of text — break long content into digestible sections with spacing.`;



// Store chat sessions in memory
const chatSessions = new Map();

// Fallback model chain if primary model is unavailable
const MODEL_FALLBACKS = {
    'gemini-2.5-flash': ['gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    'gemini-2.5-pro':   ['gemini-2.5-flash', 'gemini-2.0-flash'],
    'gemini-2.0-flash': ['gemini-2.0-flash-lite'],
};

// Check if an error is a key-related failure (rate limit / quota / invalid key)
function isKeyFailure(err) {
    const status = err.status;
    const msg = err.message || '';
    return (
        status === 429 ||
        status === 401 ||
        status === 403 ||
        msg.includes('429') ||
        msg.includes('401') ||
        msg.includes('403') ||
        msg.includes('QUOTA_EXCEEDED') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('API key not valid') ||
        msg.includes('API key expired') ||
        msg.includes('exceeded your current quota') ||
        msg.includes('rate_limit_exceeded') ||
        msg.includes('RATE_LIMIT_EXCEEDED')
    );
}

// Generate content with automatic API key fallback on 429/401
// Iterates through API keys until one succeeds or all are exhausted.
async function generateWithKeyFallback(params) {
    const totalKeys = API_KEYS.length;
    const keyErrors = [];

    for (let keyIndex = 0; keyIndex < totalKeys; keyIndex++) {
        console.log(`[API Key] 🔑 Using key index ${keyIndex + 1}/${totalKeys}`);

        // Get client for this key
        const client = getAIClient(keyIndex);

        // Models to try for this key
        const modelsToTry = [params.model, ...(MODEL_FALLBACKS[params.model] || [])];
        let modelErrors = [];

        for (const currentModel of modelsToTry) {
            // Retry with exponential backoff for transient errors (503)
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`[AI] 🚀 Key[${keyIndex + 1}] | Model: ${currentModel} (attempt ${attempt})`);
                    const stream = await client.models.generateContentStream({
                        ...params,
                        model: currentModel,
                    });
                    // Success — return result along with which key/model were used
                    console.log(`[API Key] ✅ Key index ${keyIndex + 1} succeeded with model ${currentModel}`);
                    return { stream, model: currentModel, keyIndex };
                } catch (err) {
                    const isKeyRelated = isKeyFailure(err);
                    const isNotFound = err.status === 404 ||
                        (err.message && (err.message.includes('404') || err.message.includes('NOT_FOUND') || err.message.includes('is not found')));
                    const isConnectionError = err.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                        err.cause?.code === 'ECONNRESET' ||
                        err.cause?.code === 'ETIMEDOUT' ||
                        err.cause?.code === 'UND_ERR_HEADERS_TIMEOUT';
                    const isTransientError = isConnectionError || (err.status === 503);

                    if (isKeyRelated) {
                        console.warn(`[API Key] ⚠️ Key[${keyIndex + 1}] failed (key issue): ${err.message?.substring(0, 100)}`);
                        keyErrors.push({ keyIndex, err: err.message });
                        break; // Try next key
                    } else if (isNotFound) {
                        console.warn(`[API Key] ⚠️ Key[${keyIndex + 1}] model '${currentModel}' not found, trying next model...`);
                        modelErrors.push({ model: currentModel, err: err.message });
                        break; // Try next model
                    } else if (isTransientError && attempt < 3) {
                        // Transient/connection error: retry with backoff
                        const waitMs = Math.min(1000 * Math.pow(2, attempt), 5000);
                        console.warn(`[API Key] ⚠️ Key[${keyIndex + 1}] transient error (${err.cause?.code || err.status}), retrying in ${waitMs}ms...`);
                        await new Promise(resolve => setTimeout(resolve, waitMs));
                        continue;
                    } else if (attempt === 3) {
                        // Last attempt on this model also failed
                        modelErrors.push({ model: currentModel, err: err.message });
                        console.warn(`[API Key] ⚠️ Key[${keyIndex + 1}] all retries exhausted on model '${currentModel}': ${err.message?.substring(0, 100)}`);
                    }
                }
            }
        }

        console.warn(`[API Key] ❌ Key[${keyIndex + 1}] all models failed, trying next key...`);
    }

    // All keys exhausted — throw a descriptive error
    const detailedSummary = keyErrors.map(e =>
        `Key[${e.keyIndex + 1}]: ${e.err?.substring(0, 200)}`
    ).join(' | ');
    const error = new Error(`All API keys exhausted: ${detailedSummary}`);
    error.allKeysExhausted = true;
    throw error;
}

// ============================================================
// FILE PROCESSING HELPERS
// ============================================================

async function extractPdfText(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text.substring(0, 50000);
    } catch (err) {
        console.error('[PDF Parse] Error:', err.message);
        return '[Could not extract PDF text]';
    }
}

async function extractDocxText(buffer) {
    try {
        const zip = await JSZip.loadAsync(buffer);
        const docFile = zip.file('word/document.xml');
        if (!docFile) return '[No document.xml found in DOCX]';
        const xmlContent = await docFile.async('string');
        const textMatch = xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return textMatch.substring(0, 50000);
    } catch (err) {
        console.error('[DOCX Parse] Error:', err.message);
        return '[Could not extract DOCX text]';
    }
}

async function extractZipContents(buffer) {
    try {
        const zip = await JSZip.loadAsync(buffer);
        const entries = [];
        for (const [filename, entry] of Object.entries(zip.files)) {
            if (!entry.dir) {
                const ext = path.extname(filename).toLowerCase();
                const textExts = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c', '.h', '.xml', '.yaml', '.yml', '.sh', '.rb', '.go', '.rs', '.php', '.sql', '.r', '.swift', '.kt', '.vue', '.svelte'];
                if (textExts.includes(ext)) {
                    const content = await entry.async('string');
                    entries.push(`--- ${filename} ---\n${content.substring(0, 3000)}`);
                } else {
                    entries.push(`--- ${filename} --- [binary file, ${(entry._data?.uncompressedSize || 0)} bytes]`);
                }
            } else {
                entries.push(`--- ${filename} --- [directory]`);
            }
        }
        return entries.join('\n\n').substring(0, 50000);
    } catch (err) {
        console.error('[ZIP] Extraction error:', err.message);
        return '[Could not extract ZIP content]';
    }
}

// Determine if a file is a "visual" type that Gemini can analyze natively
function isVisualFile(mimetype) {
    return mimetype.startsWith('image/') || mimetype.startsWith('video/');
}

// Determine if a file is a document type that needs text extraction
function isTextDocument(mimetype, originalname) {
    const ext = path.extname(originalname || '').toLowerCase();
    const textExtensions = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c', '.h', '.xml', '.yaml', '.yml', '.sh', '.rb', '.go', '.rs', '.php', '.sql', '.r', '.swift', '.kt'];
    return mimetype.startsWith('text/') || mimetype === 'application/json' || mimetype === 'application/javascript' || textExtensions.includes(ext);
}

// Build Gemini content parts from uploaded files
async function buildFileParts(files) {
    const parts = [];
    const fileDescriptions = [];

    for (const file of files) {
        const { mimetype, buffer, originalname, size } = file;

        // Reject 0-byte files
        if (!buffer || buffer.length === 0) {
            fileDescriptions.push(`[Skipped empty file: ${originalname}]`);
            continue;
        }

        if (isVisualFile(mimetype)) {
            // Images & videos: send as inline base64 data
            const base64Data = buffer.toString('base64');
            parts.push({
                inlineData: {
                    mimeType: mimetype,
                    data: base64Data,
                }
            });
            fileDescriptions.push(`[Attached ${mimetype.startsWith('image/') ? 'image' : 'video'}: ${originalname}]`);

        } else if (mimetype === 'application/pdf') {
            // PDF: extract text
            const text = await extractPdfText(buffer);
            parts.push({ text: `\n\n📄 Content of uploaded PDF file "${originalname}":\n\`\`\`\n${text}\n\`\`\`` });
            fileDescriptions.push(`[Attached PDF: ${originalname}]`);

        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            // DOCX: extract text
            const text = await extractDocxText(buffer);
            parts.push({ text: `\n\n📄 Content of uploaded DOCX file "${originalname}":\n\`\`\`\n${text}\n\`\`\`` });
            fileDescriptions.push(`[Attached DOCX: ${originalname}]`);

        } else if (mimetype === 'application/zip' || mimetype === 'application/x-zip-compressed') {
            // ZIP: list & extract text files
            const text = await extractZipContents(buffer);
            parts.push({ text: `\n\n📦 Contents of uploaded ZIP file "${originalname}":\n\`\`\`\n${text}\n\`\`\`` });
            fileDescriptions.push(`[Attached ZIP: ${originalname}]`);

        } else if (isTextDocument(mimetype, originalname)) {
            // Text/code files: read directly
            const text = buffer.toString('utf-8').substring(0, 50000);
            const ext = path.extname(originalname || '').replace('.', '') || 'text';
            parts.push({ text: `\n\n📝 Content of uploaded file "${originalname}":\n\`\`\`${ext}\n${text}\n\`\`\`` });
            fileDescriptions.push(`[Attached file: ${originalname}]`);

        } else {
            // Unknown: mention it but don't process
            parts.push({ text: `\n\n[Uploaded file: ${originalname} (${mimetype}, ${(size / 1024).toFixed(1)} KB) — unsupported for content extraction]` });
            fileDescriptions.push(`[Attached unsupported file: ${originalname}]`);
        }
    }

    return { parts, fileDescriptions };
}

// ============================================================
// FILE UPLOAD ENDPOINT
// ============================================================

app.post('/api/upload', upload.array('files', 10), async (req, res) => {
    try {
        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedFiles = [];

        for (const file of files) {
            const fileId = uuidv4();
            const ext = path.extname(file.originalname) || '';
            const safeName = fileId + ext;
            const filePath = path.join(UPLOADS_DIR, safeName);

            // Write buffer to disk
            fs.writeFileSync(filePath, file.buffer);

            const fileUrl = `/uploads/${safeName}`;

            uploadedFiles.push({
                url: fileUrl,
                name: file.originalname,
                type: file.mimetype,
                size: file.size,
                id: fileId,
            });
        }

        res.json({ files: uploadedFiles });

    } catch (error) {
        console.error('[Upload] Error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// ============================================================
// CONVERSATION MEMORY MIDDLEWARE
// ============================================================

function conversationMemoryMiddleware(req, res, next) {
    const sessionId = req.body.sessionId || req.headers['x-session-id'];
    if (sessionId) {
        req.conversationContext = getConversationContext(sessionId);
        req.memory = {
            get: (key) => getFromMemory(sessionId, key),
            set: (key, value) => storeInMemory(sessionId, key, value)
        };
    }
    next();
}

app.use('/api/chat', conversationMemoryMiddleware);

// Endpoint to retrieve conversation context
app.get('/api/context/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const context = getConversationContext(sessionId, 20);
    res.json({ context });
});

// ============================================================
// WEB SEARCH FUNCTIONALITY
// ============================================================

/**
 * Detect whether a user message requires a web search based on semantic intent.
 *
 * Uses a multi-strategy scoring approach:
 *  - Each matched signal contributes points toward a threshold.
 *  - Strong signals (explicit commands, core domain keywords) score higher.
 *  - Weak signals (context-dependent words like "price", "score") need multiple matches.
 *  - Anti-patterns subtract points to reduce false positives.
 *  - The message is returned as the search query if the total score >= THRESHOLD.
 *
 * All original patterns are preserved and still trigger directly.
 */
function detectWebSearchIntent(message) {
    if (!message || typeof message !== 'string') return null;
    const msg = message.toLowerCase().trim();
    const originalMessage = message.trim();

    // ============================================================
    // 0. CATEGORY B — phrases that should NEVER trigger a search
    //    These always return null immediately (no search needed)
    // ============================================================
    const categoryBPatterns = [
        // Coding help
        /\b(code\s+(?:for|example|snippet|review|debug|fix|repair)|write\s+(?:a\s+)?(?:function|program|script|class|method|app)|how\s+(?:to\s+)?(?:code|program|implement|build|create|develop|write\s+code))\b/i,
        /\b(debug|debugging|bug\s+fix|syntax\s+error|runtime\s+error|compiler\s+error)\b/i,
        /\b(html\s+code|css\s+style|javascript\s+function|react\s+component|node\s+module|api\s+endpoint|python\s+script)\b/i,
        // Explanations / definitions
        /\b(explain|define|describe|meaning|definition|concept|theory|principle|what\s+(?:is|are|does)\s+(?:the\s+)?(?:meaning|definition|concept))\b/i,
        // Mathematics / calculations
        /\b(solve|calculate|compute|evaluate|simplify|integrate|differentiate|derivative)\b/i,
        /\b(math|mathematics|algebra|calculus|geometry|trigonometry|statistics|equation|formula)\b/i,
        // Writing
        /\b(write\s+(?:an?\s+)?(?:essay|article|story|poem|letter|email|report|paragraph|sentence))\b/i,
        /\b(proofread|proofreading|edit|editing|rewrite|rewriting|grammar|spelling|punctuation)\b/i,
        // Brainstorming / creative
        /\b(brainstorm|brainstorming|ideas?\s+(?:for|about)|suggestions?\s+(?:for|about)|creative\s+ideas?)\b/i,
        // General knowledge / static facts unlikely to change
        /\b(what\s+is\s+the\s+(?:capital|population|area|highest|largest|longest|deepest|oldest|newest))\b(?!\s+(?:today|now|current|202[4-9]))/i,
        /\b(who\s+(?:discovered|invented|created|founded|wrote|painted|composed))\b/i,
        // Tutorials / how-to (non-time-sensitive)
        /\b(how\s+to\s+(?:make|build|cook|bake|install|setup|configure|use|learn|study|practice))\b/i,
        /\b(tutorial|guide|lesson|course|learn|study|practice|exercise|walkthrough)\b/i,
        // Recipes
        /\b(recipe|cooking|baking|ingredients|instructions\s+(?:for|to))\b/i,
        // Language translation
        /\b(translate|translation|how\s+do\s+you\s+say|what['']?s\s+the\s+word\s+for|in\s+(?:french|spanish|arabic|german|italian|portuguese|chinese|japanese|russian))\b/i,
    ];

    // Check Category B first — if any match, skip search entirely
    for (const pattern of categoryBPatterns) {
        if (pattern.test(message)) {
            return null;
        }
    }

    // ============================================================
    // 0b. ANTI-PATTERNS: reduce scoring for metaphorical/idiomatic usage
    // ============================================================
    const antiPatterns = [
        // Historical / non-current usage of time-sensitive words
        /\b(?:history\s+of|historical\s+|ancient\s+|medieval\s+|in\s+the\s+past|back\s+in\s+the\s+day|used\s+to)\b.*\b(?:weather|temperature|price|stock|score|news|event)\b/i,
        // Philosophical / metaphorical usage
        /\b(?:price\s+of\s+(?:freedom|justice|love|happiness|success|failure|glory|honor|war|peace|life|death))\b/i,
        /\b(?:score\s+to\s+settle|settle\s+a\s+score|know\s+the\s+score|what['']?s\s+the\s+score\s+\?)$/i,
        // Idiomatic / non-literal usage
        /\b(?:cold\s+(?:shoulder|feet|war|call|blooded)|hot\s+(?:dog|sauce|stuff|mess|take|seat|weather|girl|guy|headed))\b/i,
        /\b(?:rain\s+(?:check|on\s+(?:your\s+)?parade|forest|water|dance)|storm\s+(?:in\s+a\s+teacup|cloud|door|chaser|crowd))\b/i,
        /\b(?:stock\s+(?:up|room|option|response|answer|phrase|foot|exchange|market)\s+(?!price|value|quote))\b/i,
        // Generic computer/phone usage of "current" or "latest"
        /\b(?:current\s+(?:tab|window|page|file|folder|directory|branch|version\s+of\s+a|time\s+in))\b/i,
        // "What's new with you" type questions (not about news)
        /(?:what['']?s\s+(?:new|up)\s+(?:with\s+you|buddy|friend|man|dude|bro)\s*\??)$/i,
        /\b(?:how\s+(?:are|('?)re)\s+you)\b/i,
        // Asking about AI itself
        /\b(?:what\s+(?:can\s+you\s+do|are\s+you|is\s+your\s+name|version\s+are\s+you))\b/i,
        // Asking about concepts not current data
        /\b(?:what\s+is\s+the\s+(?:meaning|definition|concept|idea|theory)\s+of)\b/i,
        // Mathematical "average" / "mean"
        /\b(?:mean\s+temperature|average\s+temperature)\b(?!\s+(?:today|now|current|in\s+\w+\s+(?:today|now)))/
    ];

    let antiPatternScore = 0;
    for (const pattern of antiPatterns) {
        if (pattern.test(message)) {
            antiPatternScore -= 3;
        }
    }
    // Strong anti-matches can cancel weak signals entirely
    if (antiPatternScore <= -3) {
        // Don't return early - still allow explicit commands through below
    }

    // ============================================================
    // 1. EXPLICIT SEARCH COMMANDS — always trigger (unchanged)
    // ============================================================
    const explicitPatterns = [
        /search\s+(?:for\s+)?(.+)/i,
        /look\s+up\s+(.+)/i,
        /look\s+up\s+(?:for\s+)?(.+)/i,
        /search\s+the\s+web\s+(?:for\s+)?(.+)/i,
        /find\s+(?:information\s+)?(?:about|on)\s+(.+)/i,
        /latest\s+news\s+(?:about|on)?\s*(.+)/i,
        /google\s+(.+)/i,
        /browse\s+(?:the\s+)?(?:web\s+)?(?:for\s+)?(.+)/i,
        /fetch\s+(.+)/i,
        /retrieve\s+(.+)/i,
        /what\s+(?:does|do|is|are)\s+(?:the\s+)?(?:latest|current|recent)\s+(.+)/i,
        /tell\s+me\s+(?:about|what|the)\s+(.+)/i,
        /give\s+me\s+(?:the\s+)?(?:latest|current|recent)\s+(.+)/i,
        /what['']?s\s+(?:the\s+)?(?:latest|current|recent|latest\s+news\s+(?:about|on)?)?\s*(.+)/i,
        /how\s+(?:is|are)\s+(?:the\s+)?(.+?)(?:\s+(?:today|right\s+now|currently|at\s+the\s+moment))?\s*$/i,
    ];
    for (const pattern of explicitPatterns) {
        const match = message.match(pattern);
        if (match) {
            const query = match[1] ? match[1].trim() : message;
            if (query && query.length > 1) return query;
        }
    }
    if (explicitPatterns.some(p => p.test(msg))) return originalMessage;

    // ============================================================
    // 2. TOPIC-BASED INTENT DETECTION (natural language patterns)
    // ============================================================

    // --- Weather / Climate ---
    const weatherPatterns = [
        /\b(weather|forecast|climate|temperature|temperatures?)\b/i,
        /\b(rain|rainy|raining|sunny|cloudy|windy|storm|snow|snowing|fog|foggy|humid|humidity|heatwave|cold\s+(?:wave|snap)?|heat\s+index|wind\s+(?:speed|chill)|air\s+quality|uv\s+index)\b/i,
        /\b(what['']?s\s+the\s+(?:temperature|weather)\s+(?:like\s+)?(?:in|at|outside|today|right\s+now|currently)?)\b/i,
        /\b(how\s+(?:hot|cold|warm)\s+(?:is|will|does)\s+it)\b/i,
        /\b(is\s+it\s+(?:going\s+to\s+)?(?:rain|snow|sunny|cloudy|windy|stormy))\b/i,
        /\b(will\s+it\s+(?:rain|snow|be\s+(?:sunny|cloudy|windy|hot|cold|warm)))\b/i,
    ];

    // --- News / Current Events ---
    const newsPatterns = [
        /\b(news|breaking|headlines?|latest\s+updates?|current\s+(?:events?|affairs?)|what['']?s\s+happening)\b/i,
        /\b(happened\s+(?:today|yesterday|this\s+(?:week|month|year)|recently|lately))\b/i,
        /\b(what['']?s\s+(?:going\s+on|new|up))\b/i,
        /\b(what\s+happened\s+(?:in|with|to))\b/i,
        /\b(update\s+(?:me\s+)?(?:on|about))\b/i,
        /\b(anything\s+(?:new|interesting)\s+(?:with|in|about|happening))\b/i,
        /\b(event|happening|occurrence|development|announcement)\b/i,
    ];

    // --- Sports ---
    const sportsPatterns = [
        /\b(scores?|match\s+results?|game\s+(?:results?|scores?|stats?)|standings?|fixtures?|schedule|highlights?)\b/i,
        /\b(who\s+(?:won|lost|is\s+playing))\b/i,
        /\b(what['']?s\s+the\s+(?:score|result))\b/i,
        /\b(how\s+(?:did|does)\s+.+?(?:do|play|perform))\b/i,
        /\b((?:football|soccer|basketball|tennis|cricket|baseball|hockey|rugby|golf|boxing|mma|f1|formula\s+one|nfl|nba|mlb|epl|laliga|serie\s+a|bundesliga|champions\s+league)\s+(?:scores?|results?|news|match|game|updates?|fixtures?|standings?))\b/i,
        /\b(league|tournament|championship|playoffs?|finals?)\s+(?:scores?|results?|standings?|updates?|fixtures?)\b/i,
    ];

    // --- Finance / Stocks / Crypto ---
    const financePatterns = [
        /\b(stock\s+(?:price|market|quote|value|ticker)?|share\s+price|market\s+(?:cap|value|trend)|dow\s+jones|s&p\s*500|nasdaq|ftse|nifty|sensex)\b/i,
        /\b(bitcoin|btc|ethereum|eth|cryptocurrency|crypto|altcoin|solana|xrp|cardano|ada|dogecoin|doge|polkadot|dot|chainlink|link|polygon|matic|avalanche|avax)\b/i,
        /\b(price\s+of\s+|how\s+much\s+(?:is|does)\s+|value\s+of\s+|rate\s+of\s+)\b/i,
        /\b(exchange\s+rate|currency\s+(?:rate|conversion|exchange)|forex|usd\s+to|eur\s+to|gbp\s+to)\b/i,
        /\b(market\s+(?:today|now|update|trend|report|analysis))\b/i,
        /\b((?:gold|silver|oil|natural\s+gas)\s+price)\b/i,
        /\b(inflation|interest\s+rate|gdp|unemployment\s+rate)\b/i,
        /\b(how\s+much\s+(?:is|are)\s+.+?worth)\b/i,
        /\b(what['']?s\s+the\s+(?:current|latest)\s+(?:price|value|rate)\s+of)\b/i,
    ];

    // --- Education / Exams / School Schedules ---
    const educationPatterns = [
        /\b(exam\s+(?:dates?|schedule|timings?|results?|period|time|day|days)|examination\s+(?:dates?|schedule|results?))\b/i,
        /\b(baccalaureate|baccalaureat|bac\s+|bacalaureat|baccalaureat)\b/i,
        /\b(school\s+(?:schedule|calendar|dates?|year|term|holiday|holidays|break|vacation|closing|opening|registration|enrollment|admission))\b/i,
        /\b(academic\s+(?:calendar|year|schedule|dates?|term|semester|session))\b/i,
        /\b(registration\s+(?:dates?|deadline|deadlines|period|open|close|closing|opening))\b/i,
        /\b(enrollment\s+(?:dates?|deadline|deadlines|period|open|close|closing))\b/i,
        /\b(university\s+(?:dates?|calendar|schedule|admission|registration|semester|year|exam|exams|results?))\b/i,
        /\b(college\s+(?:dates?|calendar|schedule|admission|registration|semester|year|exam|exams))\b/i,
        /\b(admission\s+(?:dates?|schedule|results?|list|lists|criteria|requirements?))\b/i,
        /\b(concours\s+(?:dates?|results?|schedule|inscription|admission))\b/i,
        /\b(semester\s+(?:dates?|schedule|start|end|begins?|registration))\b/i,
        /\b(holiday\s+(?:schedule|calendar|dates?|break|vacation))\b/i,
        /\b(results?\s+(?:date|dates|day|announcement|published|declared))\b/i,
        /\b(when\s+(?:are|do|does|will|is)\s+.{1,30}(?:exam|exams|test|tests|bac|baccalaureate|registration|enrollment|admission|school|university|college|semester|holiday|vacation))\b/i,
        /\b(what\s+(?:are|is)\s+the\s+(?:exam|examination|baccalaureate|bac|test|school|university|college|semester|registration|admission)\s+(?:dates?|schedule|calendar|timings?))\b/i,
    ];

    // --- Government / Official Information ---
    const governmentPatterns = [
        /\b(government\s+(?:announcement|announcements|decision|decisions|policy|policies|regulation|regulations|law|laws|decree|decrees|reform|reforms|program|programs|initiative|initiatives))\b/i,
        /\b(official\s+(?:announcement|announcements|statement|statements|news|information|release|releases|notification|notifications))\b/i,
        /\b(public\s+(?:holiday|holidays|announcement|notice|notification|service|services|transport|transportation|health|safety))\b/i,
        /\b(ministry|minister|ministerial|governmental|parliament|parliamentary|presidential|cabinet|senate|congress|assembly)\s+(?:announcement|decision|statement|approves|approves?|passes?|votes?|adopts?|announces?|declares?|releases?|publishes?)/i,
        /\b(visa\s+(?:requirements?|rules?|policy|policies|regulations?|fees?|application|processing|status))\b/i,
        /\b(passport\s+(?:requirements?|application|processing|renewal|fees?|appointment))\b/i,
        /\b(national\s+(?:id|identity|card|document))\s+(?:requirements?|renewal|application|fees?|appointment)\b/i,
        /\b(social\s+(?:security|welfare|benefits?|assistance|aid))\b/i,
        /\b(customs\s+(?:rules?|regulations?|duties?|fees?|restrictions?))\b/i,
        /\b(tax\s+(?:rules?|regulations?|deadline|deadlines|return|returns|filing|exemption|exemptions|rates?|bracket|brackets))\b/i,
        /\b(driving\s+(?:license|licence|licenses|test|exam|exams|school|schools|permit|rules|regulations|law))\b/i,
        /\b(immigration\s+(?:rules?|policy|policies|regulations?|law|laws|status|processing|requirements?|visa|visas))\b/i,
        /\b(when\s+(?:is|are|does|do|will)\s+.{1,30}(?:election|elections|voting|registration|deadline|census|tax\s+return))\b/i,
        /\b(public\s+transport\s+(?:fare|fares|rates?|schedule|routes?|strike|strikes|new\s+line))\b/i,
    ];

    // --- Time-sensitive / freshness-dependent queries ---
    const freshnessPatterns = [
        // Training data cutoff related
        /\b(after\s+(?:2024|2025|2026)\b|beyond\s+my\s+(?:knowledge|training|data)|training\s+(?:data|cutoff)|knowledge\s+(?:cutoff|limit)|don['']?t\s+(?:know|have)\s+(?:about|information\s+(?:on|about)|data\s+(?:on|about)))/i,
        // Recency / timeliness
        /\b(recent\s+(?:events?|developments?|changes?|updates?|news|happenings?|reports?|studies?|findings?|discoveries?|releases?|launches?|products?|movies?|songs?|albums?|technology))\b/i,
        /\b(latest\s+(?:news|update|version|release|development|trend|fashion|technology|gadget|phone|movie|song|album|book|research|study|discovery|finding))\b/i,
        /\b(current\s+(?:events?|affairs?|news|situation|status|state|condition|population|president|prime\s+minister|government|price|rate|weather|time|date|year|month|week))\b/i,
        /\b(today['']?s\s+(?:news|weather|date|scores?|matches?|games?|events?|headlines?|schedule|rate|price|exchange\s+rate))\b/i,
        /\b(this\s+(?:week|month|year|morning|afternoon|evening))\s+(?:news|events?|happenings?|updates?|releases?)+\b/i,
        // Live / real-time
        /\b(live\s+(?:stream|score|feed|update|coverage|results?|match|game|event|news))\b/i,
        /\b(real[-\s]?time\s+(?:data|information|update|price|rate|traffic|stock|market))\b/i,
        // Time-anchored questions
        /\b(what['']?s\s+(?:new|trending|popular|viral|happening))\b/i,
        /\b(what\s+(?:is|are)\s+(?:the\s+)?(?:latest|current|recent|newest))\b/i,
        /\b(what\s+(?:is|are)\s+people\s+(?:talking\s+about|saying\s+about|discussing))\b/i,
        /\b(trending\s+(?:now|today|this\s+week|topics?|news|stories?))\b/i,
        /\b(up[\s-]?to[\s-]?date|up[\s-]to[\s-]?the[\s-]?minute)\b/i,
    ];

    // Combine all topic patterns
    const allTopicPatterns = [
        ...weatherPatterns,
        ...newsPatterns,
        ...sportsPatterns,
        ...financePatterns,
        ...educationPatterns,
        ...governmentPatterns,
        ...freshnessPatterns,
    ];

    // Check each pattern; if any matches, return the full message as search query
    for (const pattern of allTopicPatterns) {
        if (pattern.test(msg)) {
            return originalMessage;
        }
    }

    // ============================================================
    // 3. QUESTION-BASED INTENT DETECTION
    // ============================================================
    const questionWords = ['what', 'how', 'when', 'where', 'who', 'why', 'is', 'are',
                           'was', 'were', 'has', 'have', 'did', 'does', 'do',
                           'can', 'will', 'would', 'should', 'could', 'may', 'might'];
    const hasQuestionWord = questionWords.some(w =>
        new RegExp(`\\b${w}\\b`, 'i').test(msg)
    );
    const hasQuestionMark = msg.includes('?');

    if (hasQuestionWord || hasQuestionMark) {
        const timeSensitiveIndicators = [
            // Weather
            'weather', 'forecast', 'temperature', 'rain', 'rainy', 'sunny', 'cloudy',
            'windy', 'snow', 'storm', 'humid', 'humidity', 'climate',
            // News
            'news', 'breaking', 'headline', 'update', 'event', 'happening',
            'happened', 'occurred', 'announcement', 'latest', 'current',
            // Sports
            'score', 'sport', 'match', 'game', 'result', 'fixture', 'standings',
            'tournament', 'championship', 'playoff', 'league', 'win', 'won', 'lost',
            // Finance
            'stock', 'price', 'bitcoin', 'ethereum', 'crypto', 'cryptocurrency',
            'market', 'share', 'investment', 'rate', 'exchange', 'currency',
            'dollar', 'euro', 'gold', 'silver', 'oil', 'inflation',
            // Time-sensitive
            'current', 'live', 'real-time', 'realtime', 'recent', 'today',
            'now', 'latest', 'trending', 'viral', 'popular', 'new',
            'schedule', 'upcoming', 'tonight', 'tomorrow', 'yesterday',
            // Training data / knowledge boundary
            'cutoff', 'training', 'knowledge', 'after', 'beyond',
            // General time-sensitive
            'population', 'president', 'election', 'government', 'war', 'conflict',
            'pandemic', 'covid', 'vaccine', 'earthquake', 'hurricane', 'flood',
            'wildfire', 'election', 'policy', 'law', 'regulation',
            // Technology
            'release', 'version', 'update', 'launch', 'announced', 'unveiled',
            'iphone', 'samsung', 'android', 'windows', 'playstation', 'xbox',
            'nintendo', 'tesla', 'apple', 'google', 'microsoft', 'meta', 'openai',
            'chatgpt', 'gpt', 'gemini', 'claude', 'llama',
            // Entertainment
            'movie', 'film', 'show', 'series', 'season', 'episode', 'release',
            'box office', 'streaming', 'netflix', 'disney', 'oscar', 'grammy',
            'actor', 'actress', 'singer', 'album', 'song', 'concert', 'tour',
        ];

        for (const indicator of timeSensitiveIndicators) {
            if (msg.includes(indicator)) {
                return originalMessage;
            }
        }

        // Entity-specific patterns
        const entityPatterns = [
            /\b(?:who\s+is\s+the\s+(?:current|new|next)\s+(?:president|prime\s+minister|chancellor|king|queen|mayor|governor|ceo|director|leader))\b/i,
            /\b(?:how\s+many\s+(?:people|cases|deaths|votes?|followers?|subscribers?|users?))\b/i,
            /\b(?:what\s+(?:is|are)\s+the\s+(?:latest|current|new)\s+(?:number|total|count|amount))\b/i,
            /\b(?:when\s+(?:is|are|will|does)\s+(?:the\s+)?(?:next|upcoming|latest))\b/i,
            /\b(?:how\s+long\s+(?:is|does|will|has)).+?(?:now|currently|so\s+far|yet|already)\b/i,
        ];
        for (const pattern of entityPatterns) {
            if (pattern.test(msg)) {
                return originalMessage;
            }
        }
    }

    // ============================================================
    // 4. COMMAND / REQUEST-BASED DETECTION
    // ============================================================
    const commandPatterns = [
        /(?:tell\s+me|show\s+me|give\s+me|get\s+me|need|wanna\s+know|want\s+to\s+know)\s+(?:the\s+)?(?:latest|current|recent|today['']?s|this\s+week['']?s)\s+/i,
        /(?:what['']?s|how['']?s|where['']?s|when['']?s)\s+(?:the\s+)?(?:latest|current|recent|today['']?s)\s+/i,
    ];
    for (const pattern of commandPatterns) {
        if (pattern.test(msg)) {
            return originalMessage;
        }
    }

    // ============================================================
    // 5. SHORT TIME-SENSITIVE NOUN LOOKUP
    //    Trigger on single-topic queries with <= 6 words
    // ============================================================
    const timeSensitiveNouns = [
        /\b(?:weather|forecast|temperature)\b/i,
        /\b(?:stock|stocks|share|shares)\b/i,
        /\b(?:cryptocurrency|crypto|bitcoin|ethereum)\b/i,
        /\b(?:exchange\s+rate|exchange\s+rates)\b/i,
        /\b(?:news|headlines|headline)\b/i,
        /\b(?:score|scores|result|results|standings)\b/i,
        /\b(?:schedule|fixture|fixtures)\b/i,
        /\b(?:election|elections|poll|polls)\b/i,
        /\b(?:population|demographics)\b/i,
    ];
    const wordCount = msg.split(/\s+/).length;
    if (wordCount <= 6) {
        for (const pattern of timeSensitiveNouns) {
            if (pattern.test(msg)) {
                return originalMessage;
            }
        }
    }

    // ============================================================
    // 6. SEMANTIC INTENT SCORING SYSTEM
    //    Uses context-weighted scoring to detect implicit web search needs
    //    without relying on exact keyword matches alone.
    // ============================================================

    const words = msg.split(/\s+/).filter(w => w.length > 0);
    let score = 0;
    let matchedSignals = [];

    // --- Strong signals (3 points each) ---
    const strongSignals = [
        // Core weather terms
        /\b(weather|forecast|temperatures?|climate)\b/i,
        // Core news terms
        /\b(news|breaking|headlines?)\b/i,
        // Core sports terms
        /\b(scores?|standings?|fixtures?|playoffs?|championship)\b/i,
        // Core finance terms
        /\b(stock\s+(?:market|price|quote)|cryptocurrency|crypto|bitcoin|ethereum|nasdaq|dow\s+jones|s&p\s*500)\b/i,
        // Time-critical terms
        /\b(real[-\s]?time|live\s+(?:score|results?|updates?))\b/i,
        // Knowledge boundary
        /\b(after\s+202[4-9]|beyond\s+my\s+(?:training|knowledge))\b/i,
    ];

    for (const pattern of strongSignals) {
        if (pattern.test(message)) {
            score += 3;
            matchedSignals.push({ type: 'strong', pattern: pattern.source });
        }
    }

    // --- Medium signals (2 points each) ---
    const mediumSignals = [
        // Weather descriptors
        /\b(rain|rainy|sunny|cloudy|windy|snow|storm|humid|fog|foggy|heatwave|thunder)\b/i,
        // Sports context
        /\b(match\s+results?|game\s+(?:results?|scores?)|who\s+(?:won|lost))\b/i,
        // Finance context
        /\b(market\s+(?:today|now|update)|price\s+of|exchange\s+rate|how\s+much\s+(?:is|are)\s+\w+(?:\s+\w+)?\s+worth)\b/i,
        // Recency
        /\b(recent|latest|current|up[\s-]?to[\s-]?date|upcoming)\b/i,
        // Time anchoring
        /\b(today|yesterday|tonight|tomorrow|this\s+(?:week|month|year|morning|afternoon|evening))\b/i,
        // Event-driven
        /\b(election|tournament|finals?|opening\s+ceremony|award\s+(?:show|ceremony))\b/i,
        // Technology releases
        /\b(release\s+date|new\s+(?:iphone|samsung|android|version|update|launch))\b/i,
        // Entertainment
        /\b(box\s+office|ratings?|viewership|streaming\s+(?:numbers?|stats?|figures?))\b/i,
    ];

    for (const pattern of mediumSignals) {
        if (pattern.test(message)) {
            score += 2;
            matchedSignals.push({ type: 'medium', pattern: pattern.source });
        }
    }

    // --- Weak signals (1 point each) ---
    const weakSignals = [
        // Ambiguous but potentially time-sensitive
        /\b(score|result|price|rate|value|status|condition|situation)\b/i,
        // General time references
        /\b(now|currently|at\s+the\s+moment|right\s+now)\b/i,
        // Change over time
        /\b(changed?|changes?|updated?|trend|trending)\b/i,
        // Sports teams/leagues (implicit search need for recent results)
        /\b(nfl|nba|mlb|nhl|epl|laliga|serie\s+a|bundesliga|champions\s+league|formula\s+1|f1)\b/i,
        // Major companies (may need current info)
        /\b(tesla|apple|google|microsoft|meta|openai|netflix|amazon)\b/i,
        // Time-anchored verbs
        /\b(happened|occurred|took\s+place|was\s+released|was\s+announced)\b/i,
        // Live/current state
        /\b(how\s+(?:is|are)\s+\w+(?:\s+\w+){0,3}(?:doing|performing|looking))\b/i,
    ];

    for (const pattern of weakSignals) {
        if (pattern.test(message)) {
            score += 1;
            matchedSignals.push({ type: 'weak', pattern: pattern.source });
        }
    }

    // --- Context boosters (add points based on sentence structure) ---

    // Question format: +1 if message starts with a question word
    if (/^(what|how|when|where|who|why|is|are|was|were|has|have|did|does|do|can|will|would)\b/i.test(msg)) {
        score += 1;
        matchedSignals.push({ type: 'booster', reason: 'starts with question word' });
    }

    // Short query (<=5 words) with any strong/medium signal: +1 bonus
    if (wordCount <= 5 && matchedSignals.some(s => s.type === 'strong' || s.type === 'medium')) {
        score += 1;
        matchedSignals.push({ type: 'booster', reason: 'short focused query' });
    }

    // Contains "?" at the end: +0.5 (soft signal)
    if (msg.trim().endsWith('?')) {
        score += 0.5;
    }

    // --- Anti-pattern penalty ---
    // If the message matches a "static knowledge" pattern, reduce score
    const staticPatterns = [
        /\b(explain|define|describe|meaning|definition|concept|theory|principle|what\s+is)\b.*\b(?!current|latest|today|now|recent)/i,
        /\bhow\s+(?:to|do\s+I|can\s+I|would\s+I|does\s+\w+\s+work)\b/i,
        /\b(tutorial|guide|lesson|course|learn|study|practice|exercise)\b/i,
        /\b(code\s+(?:for|example|snippet)|write\s+a\s+(?:function|program|script))\b/i,
        /\b(recipe|cooking|baking|ingredients|instructions)\b/i,
    ];

    for (const pattern of staticPatterns) {
        if (pattern.test(message)) {
            score -= 1.5;
            matchedSignals.push({ type: 'penalty', reason: 'static knowledge query' });
        }
    }

    // Apply anti-pattern score from section 0
    score += antiPatternScore;

    // --- Threshold check ---
    const THRESHOLD = 3;

    if (score >= THRESHOLD) {
        console.log(`[Web Search] Intent score ${score} (threshold: ${THRESHOLD}) — signals:`, matchedSignals);
        return originalMessage;
    }

    // ============================================================
    // 7. MULTILINGUAL INTENT DETECTION
    //    Catches web search intents expressed in Darija, French, Arabic
    // ============================================================

    const multilingualPatterns = [
        // Darija (Moroccan Arabic) — weather
        /\b(chi\s+hal\s+[tl]\s+[td]\s+[td]\s+jaw|ch7al\s+fit\s+l\s+jaw|ch7al\s+f\s+chta|chhal\s+f\s+jaw|ch7al\s+f\s+temperature|chhal\s+fit\s+sous?)\b/i,
        /\b(ash\s+mn\s+jaw|ach\s+mn\s+jaw|chnou\s+hwal\s+jaw|chnou\s+l\s+jaw)\b/i,
        /\b(ash\s+kat\s+hbt\s+l\s+chta|wach\s+ghadi\s+tcht?\s+chta|wach\s+baghi\s+tcht?\s+chta)\b/i,
        /\b(khasni\s+(?:n[td]r|nshouf|n[td]r)\s+l\s+jaw)\b/i,
        /\b(jaw\s+(?:had\s+l\s+youm|l\youm|dyal\s+l\s+youm))\b/i,

        // Darija — news / current events
        /\b(ash\s+jdid|ach\s+jdid|chnou\s+jdid|shnu\s+jdid|achnou\s+jdid|wash\s+mn\s+jdida)\b/i,
        /\b(ash\s+kat\s+qoul\s+f\s+had\s+l\s+khabar|l\s+akhbar|ach\s+mn\s+akhbar)\b/i,
        /\b(ash\s+wqe3|l\s+khedma\s+dyal\s+l\s+youm|ash\s+kat\s+hder\s+3lih)\b/i,

        // Darija — sports
        /\b(ch7al\s+fit\s+score|ch7al\s+f\s+score|score\s+dyal\s+had\s+l\s+match)\b/i,
        /\b(achkoun\s+rb7|achkoun\s+kse7|achkoun\s+ghadi\s+yrb7)\b/i,
        /\b(match\s+dyal\s+|match\s+l\s+)\w+(\s+dyal\s+l\s+youm)?\b/i,
        /\b(resulta|resultat)\s+dyal\s+/i,

        // Darija — finance
        /\b(ch7al\s+f\s+(?:bitcoin|ethereum|crypto|stock|price|souq|l\s+market))\b/i,
        /\b(price\s+dyal|prix\s+dyal|thaman\s+dyal)\b/i,
        /\b(how\s+khtar\s+sar\s+f\s+l\s+(?:bourse|market))\b/i,

        // Darija — general time-sensitive
        /\b(ash\s+wqe3\s+(?:had\s+l\s+youm|l\s+youm|hadchi))\b/i,
        /\b(fash\s+ghadi\s+ykoun|imta\s+ghadi\s+ykoun|wa9tach\s+ghadi)\b/i,
        /\b(ach\s+mn\s+sa3a|ch7al\s+f\s+sa3a)\b/i,

        // French — weather
        /\b(m[ée]t[ée]o|m[ée]t[ée]orologie|temps\s+qu['']il\s+fait|pr[ée]visions?\s+m[ée]t[ée]o|quel\s+temps\s+fait)\b/i,
        /\b(temp[ée]rature\s+(?:actuelle|du\s+jour|d['']aujourd['']hui))\b/i,
        /\b(est[ ]?ce\s+qu['']il\s+va\s+(?:pleuvoir|neiger|faire\s+(?:beau|chaud|froid|soleil)))\b/i,
        /\b(pr[ée]visions?\s+(?:m[ée]t[ée]o|du\s+temps|m[ée]t[ée]orologiques))\b/i,
        /\b(pluie|orage|neige|temp[êe]te|canicule|inondation)\s+(?:aujourd['']hui|ce\s+(?:soir|week[ -]end|matin)|pr[ée]vue)\b/i,

        // French — news / current events
        /\b(actualit[ée]s?|infos?\s+(?:r[ée]centes|du\s+jour|chaudes)|nouvelles\s+du\s+jour|quoi\s+de\s+neuf|derni[èe]res\s+nouvelles)\b/i,
        /\b(qu['']est[ ]?ce\s+qu['']il\s+s['']est\s+pass[ée]\s+(?:aujourd['']hui|r[ée]cemment|cette\s+semaine))\b/i,
        /\b(breaking\s+news|flash\s+info|derni[èe]re\s+minute|en\s+direct|live)\b/i,
        /\b(qu['']est[ ]?ce\s+qui\s+se\s+passe\s+(?:dans\s+le\s+monde|actuellement|en\s+ce\s+moment))\b/i,

        // French — sports
        /\b(r[ée]sultats?\s+(?:sportifs|des\s+matches|des\s+jeux|du\s+(?:foot|basket|tennis)))\b/i,
        /\b(score\s+(?:du\s+match|en\s+direct|actuel))\b/i,
        /\b(qui\s+(?:a\s+gagn[ée]|gagne|a\s+perdu))\b/i,
        /\b(classement\s+(?:du\s+championnat|de\s+la\s+ligue|actuel))\b/i,
        /\b(calendrier\s+des\s+matches|programme\s+(?:tv\s+)?(?:sportif|des\s+rencontres))\b/i,

        // French — finance
        /\b(cours\s+(?:du\s+)?(?:b[oi]tc[oi]n|de\s+l['']euro|du\s+dollar|de\s+l['']or|du\s+p[ée]trole|des\s+actions))\b/i,
        /\b(bourse\s+(?:aujourd['']hui|en\s+direct|actuelle))\b/i,
        /\b(prix\s+du\s+(?:bitcoin|p[ée]trole|gaz|or|argent))\b/i,
        /\b(taux\s+de\s+change|taux\s+d['']inflation|indice\s+boursier)\b/i,
        /\b(march[ée]\s+(?:financier|boursier)\s+(?:aujourd['']hui|actuel))\b/i,

        // French — general time-sensitive
        /\b(qu['']est[ ]?ce\s+qui\s+(?:s['']est|est)\s+pass[ée]\s+(?:aujourd['']hui|r[ée]cemment))\b/i,
        /\b(d['']apr[èe]s\s+les\s+(?:derni[èe]res\s+informations|nouvelles))\b/i,
        /\b(donne[ée]s\s+(?:r[ée]centes|actualis[ée]s|en\s+temps\s+r[ée]el))\b/i,

        // Arabic — weather
        /\b(\u0627\u0644\u0637\u0642\u0633|\u0627\u0644\u062c\u0648|\u0627\u0644\u062d\u0627\u0644\u0629\s+\u0627\u0644\u062c\u0648\u064a\u0629|\u062a\u0642\u0631\u064a\u0631\s+\u0627\u0644\u0637\u0642\u0633|\u062f\u0631\u062c\u0627\u062a\s+\u0627\u0644\u062d\u0631\u0627\u0631\u0629)\b/i,
        /\b(\u0647\u0644\s+\u0633\u064a\u0645\u0637\u0631|\u0647\u0644\s+\u0633\u062a\u062b\u0644\u062c|\u0647\u0644\s+\u0627\u0644\u062c\u0648\s+\u0645\u0634\u0645\u0633|\u0645\u0627\s+\u062d\u0627\u0644\u0629\s+\u0627\u0644\u0637\u0642\u0633)\b/i,

        // Arabic — news
        /\b(\u0627\u0644\u0623\u062e\u0628\u0627\u0631|\u0622\u062e\u0631\s+\u0627\u0644\u0623\u062e\u0628\u0627\u0631|\u0623\u062e\u0628\u0627\u0631\s+\u0627\u0644\u064a\u0648\u0645|\u0627\u0644\u0646\u0634\u0631\u0627\u062a\s+\u0627\u0644\u0625\u062e\u0628\u0627\u0631\u064a\u0629)\b/i,
        /\b(\u0645\u0627\s+\u0627\u0644\u062c\u062f\u064a\u062f|\u0622\u062e\u0631\s+\u0627\u0644\u0645\u0633\u062a\u062c\u062f\u0627\u062a|\u0623\u062d\u062f\u0627\u062b\s+\u0627\u0644\u0633\u0627\u0639\u0629)\b/i,
        /\b(\u0645\u0627\s+\u0630\u0627\s+\u064a\u062d\u062f\u062b|\u0645\u0627\s+\u0627\u0644\u0630\u064a\s+\u062d\u062f\u062b)\b/i,

        // Arabic — sports
        /\b(\u0627\u0644\u0646\u062a\u0627\u0626\u062c|\u0646\u062a\u064a\u062c\u0629\s+\u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629|\u0646\u062a\u0627\u0626\u062c\s+\u0627\u0644\u0645\u0628\u0627\u0631\u064a\u0627\u062a|\u0627\u0644\u0646\u062a\u0627\u0626\u062c\s+\u0627\u0644\u0631\u064a\u0627\u0636\u064a\u0629)\b/i,
        /\b(\u0645\u0646\s+\u0641\u0627\u0632|\u0645\u0646\s+\u062e\u0633\u0631|\u0627\u0644\u0641\u0627\u0626\u0632|\u0627\u0644\u062e\u0627\u0633\u0631)\b/i,
        /\b(\u0627\u0644\u062a\u0631\u062a\u064a\u0628|\u0627\u0644\u062a\u0631\u062a\u064a\u0628\s+\u0627\u0644\u0631\u064a\u0627\u0636\u064a|\u062c\u062f\u0648\u0644\s+\u0627\u0644\u062f\u0648\u0631\u064a)\b/i,

        // Arabic — finance
        /\b(\u0627\u0644\u0628\u064a\u062a\u0643\u0648\u064a\u0646|\u0627\u0644\u0639\u0645\u0644\u0627\u062a\s+\u0627\u0644\u0631\u0642\u0645\u064a\u0629|\u0633\u0639\u0631\s+\u0627\u0644\u0628\u064a\u062a\u0643\u0648\u064a\u0646)\b/i,
        /\b(\u0627\u0644\u0628\u0648\u0631\u0635\u0629|\u0633\u0648\u0642\s+\u0627\u0644\u0623\u0633\u0647\u0645|\u0645\u0624\u0634\u0631\s+\u0627\u0644\u0628\u0648\u0631\u0635\u0629)\b/i,
        /\b(\u0633\u0639\u0631\s+\u0627\u0644\u0635\u0631\u0641|\u0633\u0639\u0631\s+\u0627\u0644\u0630\u0647\u0628|\u0623\u0633\u0639\u0627\u0631\s+\u0627\u0644\u0639\u0645\u0644\u0627\u062a)\b/i,
        /\b(\u0627\u0644\u062a\u0636\u062e\u0645|\u0645\u0639\u062f\u0644\s+\u0627\u0644\u0641\u0627\u0626\u062f\u0629|\u0627\u0644\u0646\u0627\u062a\u062c\s+\u0627\u0644\u0645\u062d\u0644\u064a\s+\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a)\b/i,
    ];

    for (const pattern of multilingualPatterns) {
        if (pattern.test(message)) {
            console.log(`[Web Search] Multilingual pattern matched: ${pattern.source.substring(0, 60)}...`);
            return originalMessage;
        }
    }

    // ============================================================
    // 8. COMPOUND INTENT DETECTION (multiple weak signals combine)
    //    Two or more weak signals in the right context trigger search
    // ============================================================

    // Count domain-relevant terms (even if not caught by specific patterns above)
    const domainTerms = {
        weather: ['weather', 'forecast', 'temperature', 'rain', 'snow', 'storm', 'wind', 'humidity', 'climate', 'sunny', 'cloudy', 'fog', 'thunder', 'lightning', 'precipitation', 'heat', 'cold', 'fahrenheit', 'celsius'],
        news: ['news', 'announcement', 'announced', 'report', 'reported', 'statement', 'press', 'media', 'headline', 'journal', 'article', 'coverage', 'breakthrough'],
        sports: ['match', 'game', 'tournament', 'championship', 'league', 'playoff', 'final', 'score', 'goal', 'win', 'won', 'lost', 'defeat', 'victory', 'player', 'team', 'athlete', 'coach', 'manager'],
        finance: ['market', 'stock', 'share', 'bond', 'index', 'etf', 'dividend', 'portfolio', 'investment', 'investor', 'trading', 'bull', 'bear', 'rally', 'correction', 'volatility'],
        crypto: ['crypto', 'blockchain', 'token', 'defi', 'nft', 'wallet', 'mining', 'proof', 'consensus', 'decentralized'],
        time: ['today', 'yesterday', 'tomorrow', 'tonight', 'weekly', 'monthly', 'annual', 'quarterly', 'fiscal', 'season', 'current', 'recent', 'latest', 'newest', 'upcoming', 'live'],
        live: ['live', 'real-time', 'realtime', 'streaming', 'broadcast', 'direct', 'instant', 'immediate'],
    };

    let domainHits = {};
    for (const [domain, terms] of Object.entries(domainTerms)) {
        for (const term of terms) {
            const termRegex = new RegExp(`\\b${term}\\b`, 'i');
            if (termRegex.test(message)) {
                domainHits[domain] = (domainHits[domain] || 0) + 1;
            }
        }
    }

    // Multiple different domain terms present (e.g., "stock market today" has finance+time)
    const activeDomains = Object.entries(domainHits).filter(([_, count]) => count > 0);
    if (activeDomains.length >= 2) {
        const totalHits = activeDomains.reduce((sum, [_, count]) => sum + count, 0);
        if (totalHits >= 3) {
            console.log(`[Web Search] Compound intent: domains=${activeDomains.map(([d, c]) => `${d}(${c})`).join(', ')}`);
            return originalMessage;
        }
    }

    // A single domain with 3+ hits (e.g., "match game score winner")
    if (activeDomains.length === 1) {
        const [_, count] = activeDomains[0];
        if (count >= 3) {
            console.log(`[Web Search] Single domain multiple hits: ${activeDomains[0][0]}(${count})`);
            return originalMessage;
        }
    }

    return null;
}

async function performWebSearch(query, retries = 2) {
    if (!query) return null;
    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const results = await DDG.search(query, {
                resultsPerPage: 5,
            });
            if (!results || results.length === 0) return null;
            const processed = results.map(r => ({
                title: r.title || '',
                url: r.url || '',
                description: r.description || '',
                trusted: isTrustedSource(r.url)
            })).filter(r => r.title && r.url);

            // Add metadata about search confidence
            if (processed.length > 0) {
                console.log(`[Web Search] Query: "${query}" — found ${processed.length} results, ${processed.filter(r => r.trusted).length} trusted`);
            }
            return processed;
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                console.warn(`[Web Search] Attempt ${attempt} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
        }
    }

    console.error('[Web Search] Error:', lastError?.message);
    return null;
}

function isTrustedSource(url) {
    if (!url) return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        const trustedDomains = [
            '.gov', '.org', '.edu',
            'wikipedia.org', 'bbc.com', 'reuters.com', 'ap.org',
            'who.int', 'cdc.gov', 'nasa.gov', 'nature.com',
            'arxiv.org', 'ieee.org', 'acm.org'
        ];
        return trustedDomains.some(d => hostname.endsWith(d) || hostname.includes(d.replace('.', '')));
    } catch {
        return false;
    }
}

function formatSearchResultsForAI(results) {
    if (!results || results.length === 0) return '';
    const formatted = results.map((r, i) =>
        `[${i + 1}] ${r.title}${r.trusted ? ' (trusted)' : ''}\n   URL: ${r.url}\n   ${r.description}`
    ).join('\n\n');
    return `\n\n--- Web Search Results ---\n${formatted}\n--- End of Search Results ---\n`;
}

app.post('/api/chat', upload.array('files', 10), async (req, res) => {
    try {
        let message = req.body.message || '';
        const sessionId = req.body.sessionId;
        const userName = req.body.userName;
        const userGender = req.body.userGender || 'Prefer not to say';
        const userLocation = req.body.userLocation || req.body.location || '';
        const model = req.body.model || 'gemini-2.5-flash';
        const temperature = req.body.temperature || 0.7;
        const files = req.files || [];

        if (!message && files.length === 0) {
            return res.status(400).json({ error: 'Message or files required' });
        }

        // Detect ambiguity first
        const ambiguityResult = detectAmbiguity(message);
        if (ambiguityResult.isAmbiguous && ambiguityResult.clarifications.length > 0) {
            const session = chatSessions.get(sessionId) || { history: [] };
            return res.json({
                text: ambiguityResult.clarifications[0],
                metadata: {
                    type: 'clarification',
                    ambiguity: ambiguityResult
                }
            });
        }

        // Detect intent
        const intent = detectIntent(message);
        console.log(`[Intent] Detected: ${intent.type} (confidence: ${intent.confidence}, search needed: ${intent.requiresSearch})`);

        // Store in conversation memory for context
        storeInMemory(sessionId, 'lastIntent', intent);
        storeInMemory(sessionId, 'lastMessage', message.substring(0, 100));

        console.log(`[Chat] session=${sessionId} files=${files.length} model=${model}`);

        // Determine if web search is needed
        let searchResults = null;
        const searchDecision = shouldPerformWebSearch(message, intent, searchResults);

        if (searchDecision.needsSearch) {
            const searchQuery = detectWebSearchIntent(message);
            if (searchQuery) {
                console.log(`[Web Search] Auto-decision: searching for "${searchQuery}"`);
                searchResults = await performWebSearch(searchQuery);
                if (searchResults && searchResults.length > 0) {
                    const searchResultsContext = formatSearchResultsForAI(searchResults);
                    message = message + searchResultsContext;
                    console.log(`[Web Search] Found ${searchResults.length} results`);
                }
            }
        }

        let session = chatSessions.get(sessionId);

        const locationContext = userLocation ? ` The user's location is: ${userLocation}. Use this when providing weather, local recommendations, or location-specific information.` : '';
        const genderContext = userGender !== 'Prefer not to say' ? ` The user has selected their gender as "${userGender}". You may adapt your responses to be contextually appropriate when relevant (e.g., addressing them correctly, using appropriate language). Do not force gender into every response — only use it when it naturally fits the conversation.` : '';
        // Dynamic current date/time context — computed at request time, never hardcoded
        const now = new Date();
        const currentDateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const currentTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
        const currentYear = now.getFullYear();
        const dateContext = `\n\nCURRENT DATE/TIME CONTEXT (use this as the real current date — do NOT use training data dates):\nToday is ${currentDateStr}.\nCurrent time: ${currentTimeStr}.\nCurrent year: ${currentYear}.\n\nIMPORTANT: When asked about the current year, date, time, or any time-sensitive information, ALWAYS use the date/time provided above. Do not default to your training data's date. The real current year is ${currentYear}, not 2024 or 2025.`;
        const currentSystemPrompt = `${SYSTEM_PROMPT}${dateContext}\n\nIMPORTANT: The user you are talking to is named "${userName || 'User'}". Address them by this name occasionally when it feels natural.${locationContext}${genderContext}`;

        if (!session) {
            session = {
                history: [
                    { role: "user", parts: [{ text: currentSystemPrompt }] },
                    { role: "model", parts: [{ text: "Understood. I will follow these instructions." }] }
                ],
                createdAt: Date.now()
            };
            chatSessions.set(sessionId, session);
        }

        // Build content parts
        const userParts = [];
        let fileDescriptions = [];

        // Process uploaded files
        if (files.length > 0) {
            const { parts: fileParts, fileDescriptions: descs } = await buildFileParts(files);
            userParts.push(...fileParts);
            fileDescriptions = descs;
        }

        // Add text message
        if (message) {
            userParts.push({ text: message });
        } else if (files.length > 0) {
            // No text message but files attached — ask AI to analyze
            userParts.push({ text: 'Please analyze the attached file(s) and describe what you see.' });
        }

        // Add to session history (text-only summary for history, since we can't store binary data efficiently)
        const historyText = [message, ...fileDescriptions].filter(Boolean).join('\n');
        session.history.push({ role: "user", parts: [{ text: historyText }] });

        // Build the full content array for this request
        // Use history for context but replace the last user entry with the full multimodal parts
        const contents = [
            ...session.history.slice(0, -1), // all history except last
            { role: "user", parts: userParts }  // last entry with full file data
        ];

        // Setup SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const { stream: responseStream, model: usedModel, keyIndex } = await generateWithKeyFallback({
            model,
            contents,
            config: {
                systemInstruction: currentSystemPrompt,
                temperature: parseFloat(temperature),
            }
        });

if (usedModel !== model || keyIndex !== 0) {
            console.log(`[AI] ✅ Success with key[${keyIndex + 1}] model=${usedModel}${keyIndex > 0 ? ' (fallback)' : ''}`);
        }

        let fullReply = '';

        // Stream AI response chunks with safe writes (prevents crash on client disconnect)
        try {
            for await (const chunk of responseStream) {
                const chunkText = chunk.text;
                if (chunkText) {
                    fullReply += chunkText;
                    const ok = safeSseWrite(res, `data: ${JSON.stringify({ text: chunkText })}\n\n`);
                    if (!ok) {
                        // Client disconnected — stop streaming gracefully
                        console.log('[Chat] Client disconnected during stream');
                        break;
                    }
                }
            }
        } catch (streamErr) {
            console.error('[Chat] Stream error:', streamErr.message?.substring(0, 150));
            // Don't crash — client may have disconnected, log and continue
        }

        // Anti-hallucination validation
        const antiHallucinationCheck = validateAgainstSources(fullReply, searchResults, message);
        if (!antiHallucinationCheck.isValid) {
            console.warn(`[Anti-Hallucination] Issues detected:`, antiHallucinationCheck.issues.map(i => i.type).join(', '));
        }

        // Source verification
        const sourceVerification = extractSourcesFromResponse(fullReply, searchResults);

        // Append full AI reply to history (even if partial)
        session.history.push({ role: "model", parts: [{ text: fullReply || '[No response generated]' }] });

        // Include metadata in final response
        safeSseWrite(res, `data: ${JSON.stringify({
            text: '',
            done: true,
            metadata: {
                intent: detectIntent(message, searchResults),
                sources: sourceVerification.sources,
                hallucinationCheck: antiHallucinationCheck
            }
        })}\n\n`);
        safeSseEnd(res);

    } catch (error) {
        console.error('Chat Endpoint Error:', error);

        // Detect if all API keys were exhausted
        const allKeysExhausted = error.allKeysExhausted === true || (
            error.message && error.message.includes('All API keys exhausted')
        );

        const is503 = error.status === 503 ||
            (error.message && (error.message.includes('503') || error.message.includes('UNAVAILABLE')));
        const is429 = error.status === 429 ||
            (error.message && error.message.includes('429'));
        const isQuotaExceeded = error.message && (
            error.message.includes('QUOTA_EXCEEDED') ||
            error.message.includes('quota') ||
            error.message.includes('RESOURCE_EXHAUSTED') ||
            error.message.includes('exceeded your current quota')
        );

        let errorMsg;
        if (allKeysExhausted) {
            errorMsg = '⚠️ All API keys have been exhausted. Please add valid API keys in your .env file (GEMINI_API_KEY_2 through GEMINI_API_KEY_5) or check your usage limits.';
        } else if (is503) {
            errorMsg = '⚠️ The AI model is temporarily overloaded. Please try again in a moment.';
        } else if (is429) {
            errorMsg = '⚠️ Rate limit reached. Please wait a few seconds and try again.';
        } else if (isQuotaExceeded) {
            errorMsg = '⚠️ Quota exceeded. Please check your Gemini API limit or upgrade your plan.';
        } else {
            errorMsg = 'An error occurred while processing your request.';
        }

        if (!res.headersSent) {
            res.status(503).json({ error: errorMsg });
        } else {
            try {
                res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
                res.end();
            } catch (writeErr) {
                console.error('[SSE] Failed to write error:', writeErr.message);
            }
        }
    }
});

// Schedule cleanup of old chat sessions (prevent memory leak)
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of chatSessions) {
        if (now - session.createdAt > 4 * 60 * 60 * 1000) { // 4 hours
            chatSessions.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`[Cleanup] Removed ${cleaned} expired sessions. Active: ${chatSessions.size}`);
}, 30 * 60 * 1000); // every 30 minutes

// Cleanup old conversation memory entries
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [sessionId, memoryObj] of CONVERSATION_MEMORY) {
        for (const [key, entry] of Object.entries(memoryObj)) {
            if (now - entry.timestamp > MEMORY_MAX_AGE) {
                delete memoryObj[key];
                cleaned++;
            }
        }
        if (Object.keys(memoryObj).length === 0) {
            CONVERSATION_MEMORY.delete(sessionId);
        }
    }
    if (cleaned > 0) console.log(`[Memory Cleanup] Removed ${cleaned} expired memory entries. Active sessions: ${CONVERSATION_MEMORY.size}`);
}, 15 * 60 * 1000); // every 15 minutes

// Multer error handler — must be after routes
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: '⚠️ File too large. Maximum size is 50 MB per file.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(413).json({ error: '⚠️ Too many files. Maximum 10 files per message.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err.message && err.message.startsWith('Unsupported file type')) {
        return res.status(415).json({ error: `⚠️ ${err.message}` });
    }
    next(err);
});

// Use the graceful startServer with retry logic instead of direct app.listen
startServer(app, port);
