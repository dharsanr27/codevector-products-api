import pool from '../db.js';

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log(' Database connected successfully at:', res.rows[0].now);
  } catch (err) {
    console.error(' Database connection failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection();
