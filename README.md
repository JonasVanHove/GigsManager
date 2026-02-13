# GigsManager 🎵

A production-ready full-stack web app for tracking live music performances, managing payments, and calculating musician earnings — deployed on **Netlify** with **Supabase PostgreSQL**.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![Prisma](https://img.shields.io/badge/Prisma-5.19-2D3748)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-06B6D4)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E)
![Netlify](https://img.shields.io/badge/Netlify-Deployed-00C7B7)

---

## Features

- **Dashboard** — overview with summary cards (total gigs, earnings, pending payments, owed to band)
- **Full CRUD** — add, edit, delete performances via clean modal forms
- **Auto-calculations** — per-musician split, manager earnings, amount owed to others
- **Payment tracking** — client payment received + date, band members paid + date
- **Manager bonus** — fixed $ or % on top of performance fee
- **Technical fee** — separate amount belonging to the manager (not split)
- **Optimistic UI** — instant delete with rollback on failure
- **Health check** — `/api/health` endpoint for monitoring & keep-alive
- **Database keep-alive** — GitHub Actions cron prevents Supabase free-tier pause

---

## Tech Stack

| Layer       | Technology                                          |
| ----------- | --------------------------------------------------- |
| Framework   | Next.js 14 (App Router)                             |
| Language    | TypeScript                                          |
| ORM         | Prisma (with connection pooling via PgBouncer)      |
| Database    | Supabase PostgreSQL (free tier)                     |
| Styling     | Tailwind CSS                                        |
| Hosting     | Netlify (serverless)                                |
| CI/CD       | GitHub Actions                                      |

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js** ≥ 18
- A **Supabase** project (free tier — see setup below)

### 1. Clone the repo

```bash
git clone https://github.com/JonasVanHove/GigsManager.git
cd GigsManager
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials (see [Supabase Setup](#supabase-setup) below).

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. (Optional) Seed demo data

```bash
npm run db:seed
```

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Supabase Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose a name, set a **database password** (save it!), pick a region
3. Wait for the project to finish provisioning

### 2. Get your connection strings

1. Go to **Project Settings** → **Database** → **Connection string**
2. Copy the **Transaction pooler** string → this is your `DATABASE_URL`
   - Port `6543`, append `?pgbouncer=true`
3. Copy the **Session pooler** string → this is your `DIRECT_URL`
   - Port `5432`, used for migrations

### 3. Get your API keys

1. Go to **Project Settings** → **API**
2. Copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. Copy the **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Fill in `.env`

```env
DATABASE_URL="postgresql://postgres.YOUR_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.YOUR_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
```

### 5. Run migrations

```bash
npx prisma migrate dev --name init
```

### ⚠️ Keeping Supabase Alive (Free Tier)

Supabase pauses free-tier databases after **7 days of inactivity**. This repo includes a GitHub Actions cron job (`.github/workflows/keepalive.yml`) that pings Supabase every 4 days.

**Setup:**
1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:
   - `SUPABASE_URL` = your `NEXT_PUBLIC_SUPABASE_URL` value
   - `SUPABASE_ANON_KEY` = your `NEXT_PUBLIC_SUPABASE_ANON_KEY` value
3. The workflow runs automatically — you can also trigger it manually

---

## Netlify Deployment

### 1. Connect repo

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
2. Select your GitHub repo (`JonasVanHove/GigsManager`)
3. Netlify auto-detects `netlify.toml` settings

### 2. Set environment variables

In Netlify → **Site settings** → **Environment variables**, add:

| Variable                       | Value                              |
| ------------------------------ | ---------------------------------- |
| `DATABASE_URL`                 | Your pooled connection string      |
| `DIRECT_URL`                   | Your direct connection string      |
| `NEXT_PUBLIC_SUPABASE_URL`     | `https://xxxx.supabase.co`         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Your anon key                      |

### 3. Deploy

Netlify deploys automatically on every push to `main`. First deploy takes ~2 minutes.

### 4. Run production migration

After first deploy, run once from your local machine:

```bash
npx prisma migrate deploy
```

This applies all migrations to the production database.

---

## Project Structure

```
GigsManager/
├── .github/workflows/
│   ├── ci.yml                # Lint + build on every push/PR
│   └── keepalive.yml         # Cron: ping Supabase every 4 days
├── prisma/
│   ├── schema.prisma         # PostgreSQL schema + indexes
│   ├── seed.ts               # Optional demo data seeder
│   └── migrations/           # Prisma migrations
├── public/
│   └── favicon.svg           # Branded music note favicon
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── gigs/         # CRUD routes (GET/POST + GET/PUT/DELETE by id)
│   │   │   └── health/       # Health check + DB ping
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── Dashboard.tsx     # Main view with summary + gig list
│   │   ├── GigCard.tsx       # Individual gig display
│   │   ├── GigForm.tsx       # Add/edit modal with live calc preview
│   │   └── DeleteConfirm.tsx # Delete confirmation dialog
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client singleton (pooling-safe)
│   │   ├── calculations.ts   # Financial calculation engine
│   │   └── env.ts            # Runtime env validation
│   └── types/
│       └── index.ts          # Shared TypeScript interfaces
├── .env.example              # Template for environment variables
├── netlify.toml              # Netlify build config
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## API Endpoints

| Method   | Endpoint          | Description                         |
| -------- | ----------------- | ----------------------------------- |
| `GET`    | `/api/gigs`       | List gigs (newest first) `?take=&skip=` |
| `POST`   | `/api/gigs`       | Create gig (with input validation)  |
| `GET`    | `/api/gigs/:id`   | Get single gig                      |
| `PUT`    | `/api/gigs/:id`   | Update gig                          |
| `DELETE` | `/api/gigs/:id`   | Delete gig                          |
| `GET`    | `/api/health`     | Health check + DB latency           |

## Calculation Logic

| Field              | Formula                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Actual Bonus       | Fixed: `bonusAmount` · Percentage: `performanceFee × bonusAmount / 100` |
| Total Received     | `performanceFee + technicalFee + actualBonus`                           |
| Per Musician       | `performanceFee / numberOfMusicians` *                                  |
| My Earnings        | `perMusician + technicalFee + actualBonus`                              |
| Owe to Others      | `(numberOfMusicians − 1) × perMusician` *                              |

**\* Important:** If you **don't claim** the performance fee, the split automatically adjusts:
- `numberOfMusicians` for calculation → `numberOfMusicians - 1`
- Your share → `0`
- Per Musician share → increases (fewer people splitting)
- You owe all performers their full shares (the entire performance fee)

This ensures you're only paid for fees you claim and performers get fair compensation.

---

## Scaling Roadmap

| Feature              | How to add                                                       |
| -------------------- | ---------------------------------------------------------------- |
| **Multi-user auth**  | Uncomment `userId` in schema + add Supabase Auth / NextAuth.js   |
| **Multi-band**       | Uncomment `bandId` in schema + add Band model                   |
| **Full pagination**  | API already supports `?take=&skip=` — add UI page controls       |
| **Paid database**    | Upgrade Supabase plan, same connection strings                   |
| **Custom domain**    | Add in Netlify → Domain settings                                |
| **Tests**            | Add Vitest + Testing Library, mock Prisma client                 |

---

## Available Scripts

| Script               | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start dev server                     |
| `npm run build`      | Production build                     |
| `npm run lint`       | Lint with ESLint                     |
| `npm run db:migrate` | Create + run migration (dev)         |
| `npm run db:migrate:deploy` | Apply migrations (production) |
| `npm run db:seed`    | Seed demo data                       |
| `npm run db:studio`  | Open Prisma Studio (DB browser)      |
| `npm run db:reset`   | Reset database + re-seed             |
| `npm run release:patch` | Bump patch version (1.5.0 → 1.5.1) |
| `npm run release:minor` | Bump minor version (1.5.0 → 1.6.0) |
| `npm run release:major` | Bump major version (1.5.0 → 2.0.0) |

---

## Versioning & Releases

The app uses **automated semantic versioning** that updates the footer version automatically:

### Quick Release

```bash
# For bug fixes (1.5.0 → 1.5.1)
npm run release:patch

# For new features (1.5.0 → 1.6.0)
npm run release:minor

# For breaking changes (1.5.0 → 2.0.0)
npm run release:major
```

### What happens automatically:
1. ✅ **package.json** version updated
2. ✅ **src/lib/version.ts** regenerated
3. ✅ Git commit created
4. ✅ Git tag created (e.g., `v1.5.1`)
5. ✅ Everything pushed to GitHub
6. ✅ **Netlify rebuilds automatically**
7. ✅ Footer shows new version

**No manual steps needed!** The footer version will always match package.json.

---

## License

MIT
