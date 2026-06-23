# Submission Note — CodeVector Backend Task

## What I built

A Node.js + TypeScript + Express backend, backed by Postgres (hosted on Supabase),
that lets a client browse 200,000 products newest-first, filter by category, search
by name, and paginate quickly and correctly — even while new products are being
added concurrently.


## What I chose, and why

**Stack:** Node.js + TypeScript + Express + `pg`, Postgres on Supabase, deployed on
Render. I chose this because it's the stack I'm most comfortable with, which let me
focus my time on the actual hard part of the task — pagination correctness — rather
than learning new tooling under time pressure.

**Seeding 200k rows:** I generate all 200,000 products in a single
`INSERT ... SELECT FROM generate_series(...)` statement, run entirely inside
Postgres. This avoids any network round-trip for data generation — Postgres
generates and inserts the rows in one operation. In testing, this seeded all
200,000 rows in **~3.7 seconds**. I deliberately avoided row-by-row INSERTs in a
loop, which would require 200,000 separate round-trips and take minutes instead
of seconds.

**Indexing strategy:** I create the table first, seed it, *then* build indexes —
not the other way around. Maintaining an index during 200,000 incremental inserts
means updating the B-tree on every single row; building it once over a finished
dataset lets Postgres sort once and construct the index directly, which is faster.

**Pagination — cursor-based, not OFFSET:** This is the core decision the task is
testing. I used keyset pagination ordered by `(created_at DESC, id DESC)`, with a
composite index on those columns. Each page request includes a cursor (the last
row's created_at + id, base64-encoded) and the query filters
`WHERE (created_at, id) < (cursor_created_at, cursor_id)`.

I avoided OFFSET/LIMIT because:
1. **Speed:** OFFSET requires Postgres to scan and discard every skipped row, so
   performance degrades the deeper you paginate. Cursor pagination uses the index
   directly, so every page costs roughly the same regardless of depth.
2. **Correctness under concurrent writes (the explicit requirement):** OFFSET
   pagination breaks when rows are inserted mid-browse, because every row's
   *position* (its row number) shifts. A user can see a duplicate or skip a row
   depending on where the insert landed. Cursor pagination defines position by
   *value*, not row count, so it's unaffected by concurrent inserts.

`id` is used as a tiebreaker because many seeded rows share the same `created_at`
(especially at this volume); without it, sort order for tied timestamps would be
unstable across requests.

**Proving the concurrency requirement:** Rather than just reasoning about
correctness, I wrote a test script (`src/scripts/concurrency-test.ts`) that:
1. Snapshots every product ID in the table before "browsing" starts.
2. Pages through the live API exactly as a real client would.
3. Inserts 50 new rows directly into the database partway through pagination,
   simulating a concurrent write.
4. Verifies afterward that every original product was seen exactly once — no
   duplicates, no misses.

This passed cleanly against the dataset: 0 duplicates, 0 missing rows, even with
50 concurrent inserts landing mid-browse.

**Search (bonus addition):** I added an optional `?q=` parameter doing
`ILIKE '%term%'` matching on product name. I initially left this unindexed, then
added a `pg_trgm` trigram index once I recognized that a leading-wildcard ILIKE
can't use a standard B-tree index — Postgres has to scan every row otherwise. The
trigram index lets substring search use an index lookup instead of a full scan.

## What I'd improve with more time

- **Automated tests** for the API route itself (currently I have one integration-style
  script for the concurrency requirement, but no unit tests for edge cases like
  malformed cursors, invalid limits, or empty result sets).
- **Rate limiting / input validation** — the API currently caps `limit` at 100 but
  has no broader request throttling.
- **Cursor signing** — the cursor is currently a plain base64-encoded JSON object.
  A client could construct an arbitrary cursor; this doesn't expose unauthorized
  data, but signing it (e.g. HMAC) would be a cleaner practice.
- **Full-text search** instead of (or alongside) trigram-based ILIKE, if search
  needed to support multi-word queries or relevance ranking rather than simple
  substring matching.
- **Caching the first page** (most commonly requested) — I considered this but
  decided it wasn't worth the added complexity for a take-home, and it's not what
  the task is evaluating.

## How I used AI

I used Claude throughout this project — for scaffolding the project structure,
writing the seed script, designing the pagination approach, debugging deployment
issues, and writing the concurrency test. I want to be specific about where it
helped and where I caught it being wrong, since I actually verified each piece
against real data rather than trusting it blindly:

**Where AI got it wrong, and I caught it:**
1. **Category assignment bug:** an early version of the seed query used
   `(random()*4)::int` to pick from a 5-item category array, which only ever
   produced indices 1-4 — `'sports'` could never be selected. I caught this by
   actually counting category distribution in the seeded data and noticing one
   category was missing.
2. **A related, subtler bug:** even after "fixing" it to `(random()*5)::int`,
   Postgres's `::int` cast *rounds* rather than truncates, so values near 5.0
   occasionally rounded up to 5, producing an out-of-bounds array index (`NULL`).
   This only surfaced as a real constraint violation when I ran the seed at scale
   — I caught it from the actual Postgres error, not from reading the code.
3. **Silent timestamp collision bug:** the original seed query used a `LATERAL`
   subquery to generate a random `created_at` per row. Because the subquery had
   no correlation to the outer row, Postgres's planner evaluated it once and
   reused the same value for all 200,000 rows — every product ended up with an
   *identical* timestamp. This didn't throw any error; I only caught it because I
   spot-checked the actual seeded data and noticed adjacent rows shared an
   identical microsecond-precision timestamp, which is statistically
   near-impossible with genuine randomness.
4. **Deployment environment issue:** setting `NODE_ENV=production` on Render
   caused `npm install` to skip `devDependencies` — which silently broke the
   TypeScript build, since `@types/node`, `@types/pg`, and `@types/express` all
   live there. This produced dozens of confusing, unrelated-looking type errors;
   removing the variable fixed it.
5. **IPv6 connectivity issue:** Supabase's direct connection string resolves to
   an IPv6 address by default, which Render's network doesn't support, causing
   `ENETUNREACH` errors at runtime. Switching to Supabase's connection pooler
   (which is IPv4) fixed this.

**Where AI genuinely helped:** explaining *why* cursor pagination solves the
concurrency requirement (not just giving me code), the index-after-seed
performance reasoning, structuring the concurrency test design, and helping
methodically debug each deployment failure by reading actual error logs/stack
traces rather than guessing.
