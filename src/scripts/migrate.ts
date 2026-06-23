import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('Starting database migration...');

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Schema file read successfully. Executing queries...');
    await pool.query(sql);

    console.log(' Migration successful: table and indexes created.');
  } catch (error) {
    console.error(' Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigration();