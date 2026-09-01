# Large-Tenant Capacity Gate & Performance Optimization

**Goal:** Establish concrete capacity gates for high-volume contractor workspaces (> 1,000 clients/jobs/invoices), verify database connection pool headroom, and optimize mobile synthetic latency (target LCP $\le 2.5$s).

---

## 1. PostgREST 1,000-Row Pagination Ceiling

### 1.1 The Risk
By default, Supabase's PostgREST API caps any single `select` query at 1,000 rows. In workspaces with $>1,000$ jobs, payments, or client records, unpaginated calls silently return a truncated array without throwing an error, leading to missing client stats, truncated CSV exports, and inaccurate tax calculations.

### 1.2 The Standard Architecture
1. **Range-Bound Iteration**:
   - High-volume data operations use `fetchAllPages` from `src/lib/pagination.ts`:
     ```ts
     const allRows = await fetchAllPages<Job>((from, to) => query.range(from, to));
     ```
2. **Streaming Batch Processing**:
   - For sweeps and massive exports, `processPages` streams 1,000-row chunks sequentially without spiking Node memory.
3. **Applied Handlers**:
   - `listJobs(supabase, accountId, status, { fetchAll: true })`
   - `listClientsWithStats(supabase, accountId, { fetchAll: true })`
   - Full workspace tenant CSV export handlers (`/admin/accounts/[id]/export`).

---

## 2. Database Connection Pool Headroom

### 2.1 Pooler Architecture
- **Supavisor Transaction Pooler** (`aws-0-us-west-2.pooler.supabase.com:6543`):
  - Used by serverless Vercel lambdas and crons.
  - Releases database connections immediately at transaction completion, supporting 1,000+ concurrent serverless lambda instances.
- **Session Pooler** (`port 5432`):
  - Used exclusively for persistent connections (e.g. Realtime listener daemon).

### 2.2 Pool Saturation Protection
- `statement_timeout = '8s'` and `lock_timeout = '3s'` on mutating workers.
- `SKIP LOCKED` used across all queue worker claims (`cron_runs`, `sms_delivery_tasks`, `billing_events`) to prevent worker queue lock contention.

---

## 3. Mobile Performance & LCP Optimization ($\le 2.5$s Target)

### 3.1 Implemented Optimizations
1. **Modern Image Compression & Explicit Qualities**:
   - `next.config.mjs` configured with `formats: ['image/webp']` and explicit `qualities: [75, 80]` to clear Next 16 deprecation warnings while ensuring optimal serverless resize performance.
2. **Hero Image Eager Prioritization**:
   - LCP candidate on homepage (`hero-showcase.tsx`) carries `priority={true}` and responsive `sizes="(max-width: 980px) 92vw, 52vw"`.
   - Off-screen showcase slides and product videos defer rendering and network requests until scroll.
3. **Clean Font & CSS Delivery**:
   - Preloaded system font stacks (`Outfit`, `Inter`) without render-blocking remote web-font fetches.
