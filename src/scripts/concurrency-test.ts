import pool from '../db.js';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const PAGE_SIZE = 50;

const GROUND_TRUTH_LIMIT = Number(process.argv[2]) || 0;


const expectedTotalPages =
  GROUND_TRUTH_LIMIT > 0 ? Math.ceil(GROUND_TRUTH_LIMIT / PAGE_SIZE) : 4000; // ~200k / 50
const INSERT_AFTER_PAGE = Math.max(1, Math.floor(expectedTotalPages / 2));

interface Product {
  id: number;
  created_at: string;
}

interface ApiResponse {
  data: Product[];
  nextCursor: string | null;
}

async function fetchPage(cursor: string | null): Promise<ApiResponse> {
  const url = new URL(`${API_BASE}/products`);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${await res.text()}`);
  }
  const json: unknown = await res.json();
  return json as ApiResponse;
}

async function insertConcurrentRows(count: number): Promise<void> {
  console.log(`  -> Inserting ${count} new rows concurrently...`);
  await pool.query(
    `
    INSERT INTO products (name, category, price, created_at, updated_at)
    SELECT
      'Concurrent Product ' || g,
      (ARRAY['electronics','books','toys','home','sports'])[1 + trunc(random()*5)::int],
      (random()*490 + 10)::numeric(10,2),
      now(),
      now()
    FROM generate_series(1, $1) AS g;
    `,
    [count]
  );
  console.log(`  -> Insert complete.`);
}

async function getGroundTruthIds(limit: number): Promise<Set<number>> {
  if (limit > 0) {
    const { rows } = await pool.query(
      'SELECT id FROM products ORDER BY created_at DESC, id DESC LIMIT $1',
      [limit]
    );
    return new Set(rows.map((r) => Number(r.id)));
  }
  const { rows } = await pool.query('SELECT id FROM products');
  return new Set(rows.map((r) => Number(r.id)));
}

async function main() {
  console.log('Step 1: Capturing ground truth...');
  const groundTruthIds = await getGroundTruthIds(GROUND_TRUTH_LIMIT);
  console.log(`  -> ${groundTruthIds.size} products in scope for this test run.\n`);

  console.log('Step 2: Paginating through the API...');
  const seenIds: number[] = [];
  const seenIdSet = new Set<number>();
  let duplicatesFound = 0;

  let cursor: string | null = null;
  let pageNumber = 0;
  let insertedConcurrently = false;

  do {
    pageNumber++;
    const page = await fetchPage(cursor);

    for (const product of page.data) {
      const id = Number(product.id);
      if (seenIdSet.has(id)) {
        duplicatesFound++;
        console.error(`  !! DUPLICATE detected: id ${id} seen more than once`);
      }
      seenIdSet.add(id);
      seenIds.push(id);
    }

    console.log(`  Page ${pageNumber}: fetched ${page.data.length} products (running total: ${seenIds.length})`);
    if (pageNumber === INSERT_AFTER_PAGE && !insertedConcurrently) {
      await insertConcurrentRows(50);
      insertedConcurrently = true;
    }

    cursor = page.nextCursor;

    if (GROUND_TRUTH_LIMIT > 0 && seenIds.length >= GROUND_TRUTH_LIMIT) {
      break;
    }
  } while (cursor !== null);

  console.log(`\nStep 3: Pagination complete. Total products seen: ${seenIds.length}\n`);

  console.log('Step 4: Verifying correctness...');

  // Check 1: every ground-truth id was seen
  const missingIds = [...groundTruthIds].filter((id) => !seenIdSet.has(id));

  // Check 2: no duplicates among seen ids
  const noDuplicates = duplicatesFound === 0 && seenIds.length === seenIdSet.size;

  console.log(`  Ground truth products: ${groundTruthIds.size}`);
  console.log(`  Products seen during pagination: ${seenIdSet.size} (raw count: ${seenIds.length})`);
  console.log(`  Missing products: ${missingIds.length}`);
  console.log(`  Duplicate detections: ${duplicatesFound}`);

  if (missingIds.length === 0 && noDuplicates) {
    console.log('\n PASS: No duplicates, no missing products. Pagination is correct under concurrent writes.');
  } else {
    console.log('\n FAIL: Pagination broke under concurrent writes.');
    if (missingIds.length > 0) {
      console.log(`  Sample missing ids: ${missingIds.slice(0, 10).join(', ')}`);
    }
    process.exitCode = 1;
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});