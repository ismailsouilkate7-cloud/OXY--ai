import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Create a new pool using the connection string from environment variables
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Provide a fallback if DATABASE_URL is somehow empty or misconfigured locally
    // but in production it should use SSL.
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Initialize database schema
export async function initDb() {
    // If DATABASE_URL is using the dummy placeholder, warn the user
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('username:password')) {
        console.warn('⚠️  DATABASE_URL is not configured properly in .env. Database features will fail until a valid PostgreSQL connection string is provided.');
        return;
    }

    try {
        const client = await pool.connect();
        
        // Ensure pgcrypto extension is available for gen_random_uuid()
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                gender VARCHAR(50) DEFAULT 'Prefer not to say',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create conversations table
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id VARCHAR(255) PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create messages table
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

        console.log('✅ Database schema initialized successfully');
        client.release();
    } catch (err) {
        console.error('❌ Error initializing database:', err);
    }
}

export default pool;
