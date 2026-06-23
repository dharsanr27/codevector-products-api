import pool from '../db.js';

async function seed() {
  const count = process.argv[2] ? Number(process.argv[2]) : 1000;

  console.log(`Seeding ${count} products...`);

  try {
    const start = Date.now();

    await pool.query(
      `
      INSERT INTO products (name, category, price, created_at, updated_at)
      SELECT
        'Product ' || g,
        (ARRAY['electronics','books','toys','home','sports'])[1 + trunc(random()*5)::int],
        (random()*490 + 10)::numeric(10,2),
        ts,
        ts
      FROM (
        SELECT
          g,
          now() - (random() * interval '365 days') AS ts
        FROM generate_series(1, $1) AS g
      ) sub;
      `,
      [count]
    );

    
    const elapsedMs = Date.now() - start;
    const { rows } = await pool.query('SELECT count(*) FROM products');

    console.log(` Done in ${elapsedMs}ms. Total rows: ${rows[0].count}`);
  } catch (err) {
    console.error(' Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();


  }
}

seed();