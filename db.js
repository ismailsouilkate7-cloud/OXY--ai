import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import dns from 'dns/promises';

dotenv.config();

// ============================================================
// DIAGNOSTIC STATE
// ============================================================
let isDbReady = false;
let pool = null;

const dbDiagnostics = {
    status: 'unchecked',
    hostname: null,
    hostnameResolves: false,
    dnsError: null,
    urlError: null,
    connectionError: null,
};

// ============================================================
// HELPERS
// ============================================================
function maskDbUrl(raw) {
    if (!raw) return '(not set)';
    try {
        const u = new URL(raw);
        if (u.password) u.password = '****';
        if (u.username && u.username.length > 3) u.username = u.username.slice(0, 3) + '***';
        else if (u.username) u.username = u.username[0] + '***';
        return u.toString();
    } catch {
        return '(invalid URL format)';
    }
}

// ============================================================
// STEP 1: ENVIRONMENT CHECK
// ============================================================
function checkEnvironment() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.log('[ENV CHECK] ❌ DATABASE_URL is not defined in environment variables');
        dbDiagnostics.status = 'no_url';
        return null;
    }

    console.log(`[ENV CHECK] ✅ DATABASE_URL = ${maskDbUrl(dbUrl)}`);

    let parsed;
    try {
        parsed = new URL(dbUrl);
    } catch (err) {
        console.log(`[ENV CHECK] ❌ DATABASE_URL is not a valid URL: ${err.message}`);
        dbDiagnostics.status = 'invalid_url';
        dbDiagnostics.urlError = err.message;
        return null;
    }

    // Validate protocol
    if (!parsed.protocol || !parsed.protocol.startsWith('postgres')) {
        console.log(`[ENV CHECK] ⚠️  Protocol is "${parsed.protocol}" — expected "postgresql:" or "postgres:"`);
    } else {
        console.log(`[ENV CHECK] ✓ Protocol: ${parsed.protocol}//`);
    }

    const hasUser = parsed.username && parsed.username.length > 0;
    const hasPassword = parsed.password && parsed.password.length > 0;
    console.log(`[ENV CHECK] ✓ Username: ${hasUser ? (parsed.username.slice(0, 3) + '***') : '(empty)'}`);
    console.log(`[ENV CHECK] ✓ Password: ${hasPassword ? '****' : '(empty)'}`);
    console.log(`[ENV CHECK] ✓ Hostname: ${parsed.hostname}`);
    console.log(`[ENV CHECK] ✓ Port:     ${parsed.port || '(default 5432)'}`);
    console.log(`[ENV CHECK] ✓ Database: ${parsed.pathname ? parsed.pathname.replace(/^\//, '') : '(not specified)'}`);

    // Check for common placeholder patterns
    const fullUrl = dbUrl.toLowerCase();
    if (fullUrl.includes('username:password') || fullUrl.includes('your_')) {
        console.log('[ENV CHECK] ⚠️  DATABASE_URL appears to contain placeholder values (username:password or your_)');
        dbDiagnostics.status = 'placeholder';
        return null;
    }

    dbDiagnostics.hostname = parsed.hostname;
    return parsed;
}

// ============================================================
// STEP 2: DNS RESOLUTION CHECK
// ============================================================
async function checkDns(parsed) {
    if (!parsed) return false;

    const hostname = parsed.hostname;

    // Skip DNS check for localhost / IP addresses
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
        console.log('[DNS CHECK] ⏭️  Skipping DNS — localhost address');
        dbDiagnostics.hostnameResolves = true;
        return true;
    }

    try {
        const records = await dns.resolve4(hostname);
        console.log(`[DNS CHECK] ✅ "${hostname}" resolves to ${records.join(', ')}`);
        dbDiagnostics.hostnameResolves = true;
        return true;
    } catch (err) {
        console.error(`[DNS CHECK] ❌ DNS resolution FAILED for "${hostname}": ${err.code}`);
        dbDiagnostics.hostnameResolves = false;
        dbDiagnostics.dnsError = err.code;

        // Root-cause analysis
        if (hostname.includes('pooler.supabase.com')) {
            console.error(`[DNS CHECK]   💡 This is a Supabase connection pooler hostname.`);
            console.error(`[DNS CHECK]      Pooler hostnames (pooler.supabase.com) are internal to`);
            console.error(`[DNS CHECK]      Supabase's network and may not be resolvable from your`);
            console.error(`[DNS CHECK]      local machine or external hosts.`);
            console.error(`[DNS CHECK]`);
            console.error(`[DNS CHECK]   🔧 FIX: Use the DIRECT connection string from your Supabase`);
            console.error(`[DNS CHECK]      dashboard: Settings → Database → Connection string →`);
            console.error(`[DNS CHECK]      select "Direct connection" (port 5432, NOT 6543).`);
            console.error(`[DNS CHECK]`);
            console.error(`[DNS CHECK]   🔧 ALTERNATIVE: If you need the pooler, check that your`);
            console.error(`[DNS CHECK]      network allows outbound DNS to pooler.supabase.com or`);
            console.error(`[DNS CHECK]      configure a custom DNS resolver.`);
        } else if (err.code === 'ENOTFOUND') {
            console.error(`[DNS CHECK]   💡 "${hostname}" does not exist in DNS.`);
            console.error(`[DNS CHECK]      Check that the hostname is spelled correctly in your`);
            console.error(`[DNS CHECK]      DATABASE_URL and that you have internet connectivity.`);
        } else if (err.code === 'EAI_AGAIN') {
            console.error(`[DNS CHECK]   💡 DNS lookup timed out. Check your network connection.`);
        }

        dbDiagnostics.status = 'dns_failure';
        return false;
    }
}

// ============================================================
// STEP 3: DATABASE CONNECTION & SCHEMA INIT
// ============================================================
async function tryConnectAndInit(parsed) {
    if (!parsed) return false;

    const ssl = parsed.hostname === 'localhost'
        ? false
        : { rejectUnauthorized: false };

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl,
    });

    console.log(`[DB CHECK] 🔌 Connecting to ${parsed.hostname}:${parsed.port || '5432'}...`);

    try {
        const client = await pool.connect();

        // Schema init
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        await client.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id VARCHAR(255) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE CASCADE,
                role VARCHAR(50) NOT NULL,
                content TEXT,
                files JSONB DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        client.release();
        console.log('[DB CHECK] ✅ Database schema initialized successfully');
        dbDiagnostics.status = 'connected';
        dbDiagnostics.connectionError = null;
        return true;
    } catch (err) {
        const msg = err.message || String(err);
        console.error(`[DB CHECK] ❌ Database connection failed: ${msg.substring(0, 300)}`);

        // Root-cause analysis for connection errors
        if (err.code === 'ECONNREFUSED') {
            console.error(`[DB CHECK]   💡 Connection refused. The database server may be down,`);
            console.error(`[DB CHECK]      or a firewall is blocking port ${parsed.port || '5432'}.`);
        } else if (err.code === 'ETIMEDOUT') {
            console.error(`[DB CHECK]   💡 Connection timed out. Check network connectivity and`);
            console.error(`[DB CHECK]      that the hostname resolves to a reachable IP.`);
        } else if (err.code === 'ENOTFOUND') {
            console.error(`[DB CHECK]   💡 Hostname not found (also failed at DNS check).`);
        } else if (err.message && err.message.includes('password')) {
            console.error(`[DB CHECK]   💡 Authentication failed. Check username/password in DATABASE_URL.`);
        } else if (err.message && err.message.includes('SSL')) {
            console.error(`[DB CHECK]   💡 SSL/TLS error. The server may require SSL connections.`);
            console.error(`[DB CHECK]      Current SSL config: ${JSON.stringify(ssl)}`);
        }

        dbDiagnostics.status = 'connection_failed';
        dbDiagnostics.connectionError = msg;
        pool = null;
        return false;
    }
}

// ============================================================
// MAIN: run full diagnostic pipeline
// ============================================================
async function runDbDiagnostics() {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  DATABASE STARTUP DIAGNOSTICS');
    console.log('═══════════════════════════════════════════════');

    const parsed = checkEnvironment();
    if (!parsed) {
        console.log('[FALLBACK MODE] 🔶 Database unavailable — auth, chat history, and');
        console.log('[FALLBACK MODE]    conversation persistence will use in-memory storage.');
        console.log('[FALLBACK MODE]    AI chat will continue to work normally.');
        console.log('');
        return;
    }

    const dnsOk = await checkDns(parsed);
    if (!dnsOk) {
        console.log('[FALLBACK MODE] 🔶 DNS resolution failed — cannot connect to database.');
        console.log('[FALLBACK MODE]    Auth and persistent storage will be disabled.');
        console.log('[FALLBACK MODE]    AI chat will continue to work normally.');
        console.log('');
        return;
    }

    const connected = await tryConnectAndInit(parsed);
    if (connected) {
        isDbReady = true;
        console.log('[DB CHECK] ✅ Database is fully operational');
    } else {
        console.log('[FALLBACK MODE] 🔶 Database connection failed — using in-memory fallback.');
        console.log('[FALLBACK MODE]    AI chat will continue to work normally.');
    }

    console.log('');
}

export async function initDb() {
    await runDbDiagnostics();
}

export function isDatabaseReady() {
    return isDbReady;
}

export function getDbDiagnostics() {
    return { ...dbDiagnostics };
}

// safePool wraps pool to throw descriptive errors when DB is unavailable
const safePool = new Proxy({}, {
    get(_target, prop) {
        if (!pool || !isDbReady) {
            if (prop === 'connect' || prop === 'query') {
                return async () => {
                    const err = new Error('Database is not connected — check startup diagnostics');
                    err.dbNotReady = true;
                    throw err;
                };
            }
            return undefined;
        }
        const val = pool[prop];
        return typeof val === 'function' ? val.bind(pool) : val;
    },
});

export default safePool;
