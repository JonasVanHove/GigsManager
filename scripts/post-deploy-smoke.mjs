#!/usr/bin/env node
/**
 * Post-deployment smoke test for a deployed GigsManager instance.
 *
 * Runs entirely over HTTP against a live base URL. No database, Supabase, or
 * in-repo dependencies are needed, so it works from any machine or CI runner
 * that can reach the deployment.
 *
 * Configuration (environment variables):
 *   SMOKE_BASE_URL       (required)  e.g. https://gigsmanager.app
 *   SMOKE_ACCESS_TOKEN   (optional)  a Supabase access token (Bearer). Needed
 *                                    for the authenticated checks (roster,
 *                                    webhooks). Without it those checks are
 *                                    skipped with a warning, not failed.
 *   SMOKE_BAND_ID        (optional)  a band id the token's account can read.
 *                                    Required for the isLeader roster check.
 *   SMOKE_WEBHOOK_SECRET (optional)  if set, a POST to /api/auth-webhook is
 *                                    expected to be signature-verified (2xx).
 *   SMOKE_TIMEOUT_MS     (optional)  per-request timeout. Default 15000.
 *
 * Exit code is 0 only when every executed check passes; otherwise 1. Skipped
 * (missing-token) checks do not affect the exit code.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://gigsmanager.app \
 *   SMOKE_ACCESS_TOKEN=eyJ... SMOKE_BAND_ID=abc123 \
 *   node scripts/post-deploy-smoke.mjs
 */

const BASE_URL = (process.env.SMOKE_BASE_URL || "").replace(/\/+$/, "");
const ACCESS_TOKEN = process.env.SMOKE_ACCESS_TOKEN || "";
const BAND_ID = process.env.SMOKE_BAND_ID || "";
const WEBHOOK_SECRET = process.env.SMOKE_WEBHOOK_SECRET || "";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

const results = [];
let hasFailure = false;
let skipped = 0;

function record({ name, ok, skipped: isSkipped = false, detail }) {
  results.push({ name, ok, skipped: isSkipped, detail });
  if (isSkipped) {
    skipped += 1;
    console.log(`  ⚪ SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
  } else if (ok) {
    console.log(`  ✅ PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    hasFailure = true;
    console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function request(path, { method = "GET", token, headers = {}, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const finalHeaders = { Accept: "application/json", ...headers };
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (HTML error page etc.) — keep json null */
    }
    return { status: res.status, headers: res.headers, json, text };
  } finally {
    clearTimeout(timer);
  }
}

// ── 1. Security headers ──────────────────────────────────────────────────────
async function checkSecurityHeaders() {
  console.log("\n[1] Security headers");
  const REQUIRED = [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
  ];
  // The landing/HTML page and an API route both carry the header block.
  const { status, headers } = await request("/");
  const hstsOk = /max-age=\d+/.test(headers.get("strict-transport-security") || "");
  const cspOk = /default-src/.test(headers.get("content-security-policy") || "");

  record({
    name: "landing page responds 2xx/3xx",
    ok: status >= 200 && status < 400,
    detail: `HTTP ${status}`,
  });
  for (const header of REQUIRED) {
    const present = headers.has(header);
    record({
      name: `header present: ${header}`,
      ok: present,
      detail: present ? (headers.get(header) || "").slice(0, 80) : "missing",
    });
  }
  record({ name: "HSTS has max-age", ok: hstsOk });
  record({ name: "CSP has default-src", ok: cspOk });
  record({
    name: "poweredBy header removed",
    ok: !headers.has("x-powered-by"),
    detail: headers.has("x-powered-by") ? "X-Powered-By leaked" : "absent (good)",
  });
}

// ── 2. Health & connectivity ─────────────────────────────────────────────────
async function checkHealth() {
  console.log("\n[2] Health & environment");
  const { status, json } = await request("/api/health");
  record({
    name: "GET /api/health is 200",
    ok: status === 200,
    detail: `HTTP ${status}`,
  });
  if (status === 200 && json) {
    record({
      name: "database connected",
      ok: json.database === "connected",
      detail: `database=${json.database} latencyMs=${json.latencyMs}`,
    });
    const env = json.env || {};
    const missing = Object.entries(env)
      .filter(([, v]) => v !== "✓")
      .map(([k]) => k);
    record({
      name: "all production env vars present",
      ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(", ")}` : "supabaseUrl + both keys ✓",
    });
  } else if (json) {
    record({
      name: "health reports database connected",
      ok: false,
      detail: `status=${json.status} database=${json.database} error=${json.error || ""}`.slice(0, 160),
    });
  }
}

// ── 3. Auth enforcement (no token ⇒ 401, not 200) ────────────────────────────
async function checkAuthEnforcement() {
  console.log("\n[3] Auth & session enforcement");
  // Every data API requires a verified Bearer token; an anonymous call must be
  // rejected. This proves the deployed instance is not leaking data.
  const { status } = await request("/api/bands");
  record({
    name: "GET /api/bands without token is rejected (401/403)",
    ok: status === 401 || status === 403,
    detail: `HTTP ${status}`,
  });
  const wh = await request("/api/webhooks");
  record({
    name: "GET /api/webhooks without token is rejected (401/403)",
    ok: wh.status === 401 || wh.status === 403,
    detail: `HTTP ${wh.status}`,
  });
}

// ── 4. Authenticated API routes ──────────────────────────────────────────────
async function checkAuthenticatedApis() {
  console.log("\n[4] Authenticated API routes");
  if (!ACCESS_TOKEN) {
    record({
      name: "authenticated checks",
      ok: true,
      skipped: true,
      detail: "set SMOKE_ACCESS_TOKEN to enable roster/webhook checks",
    });
    return;
  }

  const bands = await request("/api/bands", { token: ACCESS_TOKEN });
  record({
    name: "GET /api/bands with token is 200",
    ok: bands.status === 200,
    detail: `HTTP ${bands.status}`,
  });

  const wh = await request("/api/webhooks", { token: ACCESS_TOKEN });
  record({
    name: "GET /api/webhooks with token is 200",
    ok: wh.status === 200,
    detail: `HTTP ${wh.status}`,
  });

  if (!BAND_ID) {
    record({
      name: "roster isLeader check",
      ok: true,
      skipped: true,
      detail: "set SMOKE_BAND_ID to verify the leader flag on a real band",
    });
    return;
  }

  const roster = await request(`/api/bands/${BAND_ID}/members`, { token: ACCESS_TOKEN });
  record({
    name: "GET /api/bands/[id]/members is 200",
    ok: roster.status === 200,
    detail: `HTTP ${roster.status}`,
  });
  if (roster.status === 200 && Array.isArray(roster.json)) {
    const members = roster.json;
    record({
      name: "roster is a non-empty array",
      ok: members.length > 0,
      detail: `${members.length} member(s)`,
    });
    // Exactly one owner is flagged; owners are always leaders in the response.
    const owners = members.filter((m) => m.isOwner);
    const leaders = members.filter((m) => m.isLeader);
    record({
      name: "roster has exactly one owner",
      ok: owners.length === 1,
      detail: `${owners.length} owner(s): ${owners.map((o) => o.name).join(", ")}`,
    });
    record({
      name: "owner is also flagged as leader (isLeader)",
      ok: owners.length === 1 && owners[0].isLeader === true,
      detail: owners[0] ? `owner.isLeader=${owners[0].isLeader}` : "no owner",
    });
    record({
      name: "at least one leader present in roster",
      ok: leaders.length >= 1,
      detail: `${leaders.length} leader(s)`,
    });
    // The current user's own row must be flagged isCurrentUser.
    record({
      name: "viewer row is flagged isCurrentUser",
      ok: members.some((m) => m.isCurrentUser),
      detail: members.filter((m) => m.isCurrentUser).map((m) => m.name).join(", ") || "none",
    });
  }
}

// ── 5. Auth webhook endpoint ─────────────────────────────────────────────────
async function checkAuthWebhook() {
  console.log("\n[5] Webhook endpoints");
  // Supabase verifies a webhook URL with a GET before wiring it up; the route
  // must answer 200 with an ok status.
  const get = await request("/api/auth-webhook");
  record({
    name: "GET /api/auth-webhook verification is 200",
    ok: get.status === 200 && get.json?.status === "ok",
    detail: `HTTP ${get.status}`,
  });

  if (!WEBHOOK_SECRET) {
    record({
      name: "auth-webhook signature rejection",
      ok: true,
      skipped: true,
      detail: "set SMOKE_WEBHOOK_SECRET to assert unsigned POSTs are rejected",
    });
    return;
  }
  // An unsigned/garbage POST must be rejected (401/400), proving Svix verification
  // is active on the deployed instance.
  const bad = await request("/api/auth-webhook", {
    method: "POST",
    headers: { "svix-id": "msg_test", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,invalidsignature" },
    body: { type: "user.created", data: {} },
  });
  record({
    name: "auth-webhook rejects a bad signature (4xx)",
    ok: bad.status >= 400 && bad.status < 500,
    detail: `HTTP ${bad.status}`,
  });
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function main() {
  if (!BASE_URL) {
    console.error("❌ SMOKE_BASE_URL is required (e.g. https://gigsmanager.app)");
    process.exit(2);
  }
  console.log(`Smoke-testing ${BASE_URL}`);
  console.log(`  token: ${ACCESS_TOKEN ? "provided" : "none"} · bandId: ${BAND_ID || "none"}`);

  try {
    await checkSecurityHeaders();
    await checkHealth();
    await checkAuthEnforcement();
    await checkAuthenticatedApis();
    await checkAuthWebhook();
  } catch (err) {
    hasFailure = true;
    console.error("\n❌ Smoke test aborted by an unexpected error:", err?.message || err);
  }

  const executed = results.length - skipped;
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  console.log(
    `\n${hasFailure ? "❌" : "✅"} ${passed}/${executed} checks passed` +
      (skipped ? ` (${skipped} skipped)` : "") +
      (hasFailure ? " — FAILURES ABOVE" : "")
  );
  process.exit(hasFailure ? 1 : 0);
}

main();


