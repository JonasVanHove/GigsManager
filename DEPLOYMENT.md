# GigsManager — Production Deployment

End-to-end guide to ship GigsManager to production on **Vercel** (or **Netlify**)
with a hosted **Supabase** PostgreSQL project.

> Canonical deploy runbook. It consolidates the previously scattered notes
> (`netlify.toml`, `vercel.json`, `PRODUCTION_DEPLOYMENT_CHECKLIST.md`,
> `EMAIL_SETUP_GUIDE.md`) into one ordered checklist. Follow it top to bottom the
> first time; afterwards only §3 (migrations) and §5 (env) repeat.

---

## 0. Prerequisites

- Node.js **20.x** (matches `vercel.json` / `netlify.toml`) and npm.
- A hosted Supabase project (free tier is fine to start; see §7 keep-alive).
- A Vercel and/or Netlify account connected to this Git repository.
- Access to set **Environment Variables** on your host.

---

## 1. Supabase project setup

1. Create a project at <https://supabase.com> → **New Project**. Pick a region
   close to your users and a strong database password.
2. Wait for provisioning (~2 min).

### 1.1 Collect connection strings
**Project Settings → Database → Connection string**

| Variable       | Source                          | Format                                              |
| -------------- | ------------------------------- | --------------------------------------------------- |
| `DATABASE_URL` | **Transaction pooler** (`6543`) | `postgresql://…pooler…:6543/postgres?pgbouncer=true` |
| `DIRECT_URL`   | **Session pooler** (`5432`)     | `postgresql://…pooler…:5432/postgres`               |

- `DATABASE_URL` — used by the running app (serverless → must be pooled).
- `DIRECT_URL` — used by `prisma migrate deploy` and the seeder (CLI, unpooled).

### 1.2 Collect API keys
**Project Settings → API**

| Variable                        | Value               | Browser-exposed?  |
| ------------------------------- | ------------------- | ----------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL         | Yes (public)      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` key          | Yes (public)      |
| `SUPABASE_SERVICE_ROLE_KEY`     | `service_role` key  | **No — server only** |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It must **never**
> carry a `NEXT_PUBLIC_` prefix and must only ever be a server-side env var. Its
> handling lives in `src/lib/env.ts` (a server-only module).

### 1.3 Auth URL configuration
**Authentication → URL Configuration**

- **Site URL**: your production origin, e.g. `https://gigsmanager.app`
- **Redirect URLs**: add your production origin (e.g. `https://gigsmanager.app/**`)
  and any preview origins you want to allow.

---

## 2. Environment variables

All variables are documented in [`.env.example`](./.env.example). The authoritative
list and their required/optional + production-only semantics live in
[`src/lib/env.ts`](./src/lib/env.ts) (`missingEnvKeys` / `serverEnv`).

### 2.1 Required in **production**

| Variable                        | Notes                                                     |
| ------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`                  | Pooled (`6543`) connection string.                        |
| `DIRECT_URL`                    | Direct (`5432`) connection string, used by migrations.    |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL.                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key.                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role key — **server-only secret**.                |
| `NEXT_PUBLIC_APP_URL`           | Absolute origin, **no trailing slash** (invite/QR links). |

### 2.2 Optional (feature-gated; the app degrades gracefully without them)

| Variable                                                                            | Effect when missing                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------- |
| `GROQ_API_KEY`                                                                      | AI endpoints return `503`; rest works.       |
| `RESEND_API_KEY`                                                                    | Auth e-mails are logged but not sent.        |
| `SUPABASE_WEBHOOK_SECRET`                                                           | `/api/auth-webhook` rejects (no mail flow).  |
| `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` / `NEXT_PUBLIC_DEMO_ENABLED` | Public instant-demo login; set `…ENABLED="false"` to disable. |

---

## 3. Database migrations

Migrations live in [`prisma/migrations`](./prisma/migrations) with a
`migration_lock.toml` (provider = `postgresql`). They are applied with
`prisma migrate deploy`, which only runs *pending* migrations and never resets
data — safe to run on every build.

**Run once against the production database before (or as part of) the first build:**

```bash
# Locally, pointed at the PRODUCTION database via DIRECT_URL:
export DIRECT_URL="postgresql://…:5432/postgres"
npx prisma migrate deploy
```

On **Netlify** this already happens automatically: the build command in
[`netlify.toml`](./netlify.toml) is
`npm ci --include=dev && npx prisma migrate deploy && npm run db:generate && npm run build`.

On **Vercel**, either add `prisma migrate deploy` to the build command
(Project → Settings → Build Command), or run it once from CI against `DIRECT_URL`
before promoting the deploy.

> Verify afterwards with the health endpoint: `GET /api/health` should report
> `database: "connected"`.

---

## 4. Production build (local verification)

Before pushing, reproduce the deploy build locally to catch TypeScript / bundler
issues early:

```bash
npm ci
npx prisma generate
npm run build      # Next.js production build
npm test           # full unit suite
```

A clean build must finish with no TypeScript errors. The Prisma query engine is
traced for serverless via `next.config.mjs` → `experimental.outputFileTracing*`
and `binaryTargets = ["native", "rhel-openssl-3.0.x"]` in `schema.prisma`.

---

## 5. Deploy — Vercel

1. **Import** the repo. Framework preset: **Next.js**. [`vercel.json`](./vercel.json)
   already sets `buildCommand`, `outputDirectory` `.next`, and Node `20.x`.
2. **Environment Variables** (Project → Settings → Environment Variables): add
   every variable from §2 for the **Production** environment (and **Preview** if
   you want preview deploys to talk to a staging DB — never point preview at
   production secrets).
3. **Deploy**. Vercel runs `npm install` (postinstall runs `prisma generate`) and
   `npm run build`.
4. If `prisma migrate deploy` is not in the build command (§3), run it once now
   against `DIRECT_URL`.
5. Set `NEXT_PUBLIC_APP_URL` to the final Vercel domain, then update the Supabase
   **Site URL / Redirect URLs** (§1.3) to match.

### 5b. Deploy — Netlify

1. Connect the repo. [`netlify.toml`](./netlify.toml) defines the build command,
   publish dir (`.next`), Node `20`, Prisma engine type `library`, caching
   headers, CSP and redirects.
2. Add the same environment variables (§2) under
   **Site Settings → Build & Deploy → Environment**. `DATABASE_URL` and
   `DIRECT_URL` are needed at **build time** (migrations run during the build).
3. Add the `@netlify/plugin-nextjs` plugin (already declared in `netlify.toml`).


---

## 6. Security headers

Emitted from [`next.config.mjs`](./next.config.mjs) (works on both hosts) and
mirrored as CSP + caching in `netlify.toml`:

- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  (correct only on a host that terminates TLS end-to-end — Vercel/Netlify do)
- `Content-Security-Policy` allowing `self`, Supabase (`connect-src`), Google
  fonts, jsDelivr and `https:` images (avatars/logos).

`poweredByHeader: false` hides the `X-Powered-By: Next.js` banner.

---

## 7. Post-deploy checklist

- [ ] `GET /api/health` → `200`, `database: "connected"`, env checks show `✓`.
- [ ] Register a user, create a band, invite a second account via `/join` code,
      and confirm the roster shows the creator with the 👑 leader badge from the
      joiner's account (regression covered by `test/band-roster-route.test.ts`).
- [ ] Upload a setlist attachment (Concert Mode); confirm storage + AI paths.
- [ ] Confirm invite/QR links resolve to your production `NEXT_PUBLIC_APP_URL`.
- [ ] If e-mails are enabled: send a test verification mail end-to-end.
- [ ] **Supabase free tier pauses after ~1 week of inactivity.** The repo ships a
      keep-alive cron (`.github/workflows/keep-alive.yml`) that pings
      `/api/health`. Ensure the `KEEPALIVE_URL` variable is set, or upgrade the
      project, so the database never pauses.

---

## 8. Rollback

- **App:** Vercel/Netlify keep previous deployments — promote the last good one.
- **Database:** `prisma migrate deploy` is forward-only. Take a Supabase backup
  (Dashboard → Database → Backups) before each migration and restore if needed.
  Do not hand-edit `_prisma_migrations` to force a re-run.

---

## Quick reference — host env vars

```
DATABASE_URL=postgresql://…:6543/postgres?pgbouncer=true     # pooled, runtime
DIRECT_URL=postgresql://…:5432/postgres                      # direct, migrate
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>                 # server-only secret
NEXT_PUBLIC_APP_URL=https://gigsmanager.app                  # no trailing slash
# optional:
GROQ_API_KEY=…
RESEND_API_KEY=…
SUPABASE_WEBHOOK_SECRET=…
NEXT_PUBLIC_DEMO_ENABLED=true
```

