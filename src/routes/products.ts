import { Router, Request, Response } from 'express';
import pool from '../db.js';

const router = Router();

interface Cursor {
  createdAt: string;
  id: number;
}

function encodeCursor(createdAt: string, id: number): string {
  const payload: Cursor = { createdAt, id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);

    // pg serializes BIGSERIAL/bigint columns as strings to avoid precision
    // loss for values beyond Number.MAX_SAFE_INTEGER, so id may arrive as
    // either a string or a number depending on the source. Accept both,
    // but always normalize to a number for the query.
    const idIsValid =
      typeof parsed.id === 'number' ||
      (typeof parsed.id === 'string' && /^\d+$/.test(parsed.id));

    if (typeof parsed.createdAt === 'string' && idIsValid) {
      return { createdAt: parsed.createdAt, id: Number(parsed.id) };
    }
    return null;
  } catch {
    return null;
  }
}
router.get('/products', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const category = typeof req.query.category === 'string' ? req.query.category : null;
  const search = typeof req.query.q === 'string' ? req.query.q : null;
  const cursorParam = typeof req.query.cursor === 'string' ? req.query.cursor : null;

  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) {
    return res.status(400).json({ error: 'Invalid cursor' });
  }

  const params: unknown[] = [];
  const whereClauses: string[] = [];

  if (category) {
    params.push(category);
    whereClauses.push(`category = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    whereClauses.push(`name ILIKE $${params.length}`);
  }

  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
    whereClauses.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
  }

  params.push(limit);
  const limitParamIndex = params.length;

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT id, name, category, price, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitParamIndex}
  `;


  try {
    const { rows } = await pool.query(sql, params);

    const lastRow = rows[rows.length - 1];
    const nextCursor =
      rows.length === limit && lastRow
        ? encodeCursor(lastRow.created_at, lastRow.id)
        : null;

    res.json({
      data: rows,
      nextCursor,
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;