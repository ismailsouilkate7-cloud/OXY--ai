const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const c = await pool.connect();
  
  try {
    // Check the current column type
    const r = await c.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'user_id'`
    );
    console.log('Current user_id type:', r.rows[0]?.data_type);
    
    if (r.rows[0]?.data_type === 'uuid') {
      // Drop FK constraint on user_id if any
      await c.query('ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey');
      // Drop and recreate
      await c.query('ALTER TABLE conversations DROP COLUMN user_id');
      await c.query("ALTER TABLE conversations ADD COLUMN user_id VARCHAR(255) DEFAULT 'anonymous'");
      console.log('Column recreated as VARCHAR(255)');
    } else if (!r.rows[0]) {
      await c.query("ALTER TABLE conversations ADD COLUMN user_id VARCHAR(255) DEFAULT 'anonymous'");
      console.log('Column added');
    }
    
    // Verify
    const v = await c.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'user_id'`
    );
    console.log('New type:', v.rows[0]?.data_type);
    
    // Test query
    const test = await c.query('SELECT id, user_id FROM conversations ORDER BY updated_at DESC LIMIT 3');
    console.log('Query OK:', test.rows.length, 'rows');
    
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
  }
  
  c.release();
  pool.end();
}

main().catch(console.error);