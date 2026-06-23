import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createIndexes() {
  console.log('Building indexes on products table...');

  try {
    const sqlPath = path.join(__dirname, 'create-indexes.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const start = Date.now();
    await pool.query(sql);
    const elapsedMs = Date.now() - start;

    console.log(`✅ Indexes created in ${elapsedMs}ms.`);
  } catch (error) {
    console.error('❌ Index creation failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createIndexes();