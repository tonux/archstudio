#!/usr/bin/env node
/**
 * Optional F-REG R3 smoke — local only, not CI.
 * If ADMIN_SMOKE_BASE (or http://127.0.0.1:3000) is up, GET key admin routes
 * and expect 200. If the server is down, exit 0 with a skip message.
 */
const base = (process.env.ADMIN_SMOKE_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const paths = ['/admin', '/admin/catalog', '/admin/publish', '/admin/templates', '/admin/locale'];
const TIMEOUT_MS = Number(process.env.ADMIN_SMOKE_TIMEOUT_MS || 30_000);

async function probe() {
  try {
    const res = await fetch(`${base}/admin`, { signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, 5000)) });
    return res.status;
  } catch {
    return null;
  }
}

const status = await probe();
if (status === null) {
  console.log(`[admin-smoke] skip — no server at ${base}`);
  process.exit(0);
}

let failed = 0;
for (const p of paths) {
  try {
    const res = await fetch(`${base}${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status !== 200) {
      console.error(`[admin-smoke] FAIL ${p} → ${res.status}`);
      failed += 1;
    } else {
      console.log(`[admin-smoke] ok ${p} → 200`);
    }
  } catch (err) {
    console.error(`[admin-smoke] FAIL ${p} → ${err?.message || err}`);
    failed += 1;
  }
}

process.exit(failed === 0 ? 0 : 1);
