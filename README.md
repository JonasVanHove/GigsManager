<div align="center">

# 🎵 GigsManager

### The Modern Performance Tracking Platform for Musicians

**Stop spreadsheets. Start managing your gigs professionally.**

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-gigsmanager.netlify.app-00C7B7?style=for-the-badge)](https://gigsmanager.netlify.app)

![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma_ORM-2D3748?style=flat-square&logo=prisma)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Netlify](https://img.shields.io/badge/Netlify-00C7B7?style=flat-square&logo=netlify&logoColor=white)

</div>

---

## 🎯 What is GigsManager?

**GigsManager** is a production-ready web app built for band managers, solo artists, and musicians who need to track performances, calculate earnings, and manage payments — all in one place.

### Why GigsManager?

✅ **No more spreadsheet chaos** — Track gigs, payments, and splits in a beautiful dashboard  
✅ **Automatic calculations** — Per-musician shares, bonuses, technical fees computed instantly  
✅ **Payment transparency** — Know exactly what you've earned, what you owe, and what's outstanding  
✅ **Professional email branding** — Custom branded signup/verification emails with your logo  
✅ **Ready to deploy** — One-click deployment to Netlify, free PostgreSQL via Supabase  
✅ **Mobile-friendly** — Manage gigs on the go with responsive design

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 📊 Smart Dashboard
- **Real-time financial overview** with summary cards
- Total gigs, earnings, pending payments, owed amounts
- Collapsible sections with localStorage persistence
- Export gigs, summaries, and reports

</td>
<td width="50%">

### 💰 Automatic Calculations
- **Per-musician split** with adjustable band size
- Manager bonuses (fixed $ or % of performance fee)
- Technical fees (equipment, travel, etc.)
- Optional manager performance fee claiming

</td>
</tr>
<tr>
<td width="50%">

### 🎤 Performance Tracking
- Add/edit/delete gigs with clean modal forms
- Track client payment received + date
- Track band members paid + date
- Booking date, performance date, venue details

</td>
<td width="50%">

### 📧 Professional Emails
- **Custom branded emails** with your colors (teal/gold/orange)
- Verification emails on signup
- Password reset emails
- Welcome emails after confirmation

</td>
</tr>
<tr>
<td width="50%">

### 🎨 Modern UI/UX
- **Beautiful glassmorphic design** with brand colors
- Optimistic UI updates (instant feedback)
- Mobile hamburger menu with smooth animations
- Dark-themed cards with gold accents

</td>
<td width="50%">

### 🔒 Secure & Scalable
- **Supabase Auth** with email verification
- PostgreSQL with Prisma ORM
- Connection pooling via PgBouncer
- Webhook signature verification (Svix)

</td>
</tr>
</table>

---

## 🚀 Quick Start

Get GigsManager running locally in 5 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/JonasVanHove/GigsManager.git
cd GigsManager

# 2. Install dependencies
npm install

# 3. Set up environment variables (see setup guide below)
cp .env.example .env

# 4. Run database migrations
npx prisma migrate dev

# 5. Start development server
npm run dev
```

**Opens at:** [http://localhost:3000](http://localhost:3000)

### 📋 Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **Supabase account** (free tier) — [sign up](https://supabase.com)
- **Resend account** (optional, for emails) — [sign up](https://resend.com)

---

## 🛠️ Tech Stack

**Built with modern, production-ready technologies:**

### Core Framework
- **[Next.js 14](https://nextjs.org)** — React framework with App Router, API routes, server components
- **[TypeScript](https://www.typescriptlang.org)** — Type-safe development with full IntelliSense
- **[React 18](https://react.dev)** — Modern hooks (useState, useCallback, useMemo, useEffect)

### Database & ORM
- **[Supabase PostgreSQL](https://supabase.com)** — Managed PostgreSQL with auth, realtime, storage (FREE tier)
- **[Prisma 5](https://www.prisma.io)** — Type-safe ORM with migrations, connection pooling
- **PgBouncer** — Connection pooling for serverless environments

### Styling & UI
- **[Tailwind CSS](https://tailwindcss.com)** — Utility-first CSS with custom brand colors
- **[Lucide Icons](https://lucide.dev)** — Beautiful, consistent icon set
- **Glassmorphic Design** — Modern UI with backdrop blur, gradients, shadows

### Authentication & Email
- **[Supabase Auth](https://supabase.com/auth)** — Email/password authentication with session management
- **[Resend](https://resend.com)** — Professional branded email service (100 emails/day free)
- **[Svix](https://www.svix.com)** — Webhook signature verification for security

### Deployment & CI/CD
- **[Netlify](https://www.netlify.com)** — Serverless hosting with automatic deployments
- **[GitHub Actions](https://github.com/features/actions)** — CI/CD for linting, building, database keep-alive

---

## ⚙️ Setup Guide

### 1️⃣ Supabase Configuration

<details>
<summary><b>Click to expand setup instructions</b></summary>

#### Create Project
1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Set project name, database password, and region
3. Wait ~2 minutes for provisioning

#### Get Connection Strings
1. **Project Settings** → **Database** → **Connection string**
2. Copy **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - Add `?pgbouncer=true` at the end
3. Copy **Session pooler** (port `5432`) → `DIRECT_URL`

#### Get API Keys
1. **Project Settings** → **API**
2. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

#### Update `.env`
```env
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxxx:password@aws-0-region.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

</details>

### 2️⃣ Email Configuration (Optional)

<details>
<summary><b>Click to expand Resend + Webhook setup</b></summary>

GigsManager includes professional branded emails out of the box. Follow [EMAIL_SETUP_GUIDE.md](EMAIL_SETUP_GUIDE.md) for:

- ✅ Resend API key setup (100 free emails/day)
- ✅ Supabase webhook configuration
- ✅ Custom email templates (verification, password reset, welcome)
- ✅ Netlify environment variables

**Quick steps:**
1. Get Resend API key at [resend.com](https://resend.com)
2. Add to `.env`: `RESEND_API_KEY=re_xxxxx`
3. Create 2 Supabase webhooks (see guide)
4. Copy webhook secret to `.env`: `SUPABASE_WEBHOOK_SECRET=whsec_xxxxx`

</details>

### 3️⃣ Database Keep-Alive (Free Tier)

<details>
<summary><b>Click to expand GitHub Actions setup</b></summary>

Supabase free tier pauses databases after 7 days of inactivity. Included GitHub Action prevents this.

**Setup:**
1. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add secrets:
   - `SUPABASE_URL` = your `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_ANON_KEY` = your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Workflow runs automatically every 4 days

</details>

---

## 🌐 Deploy to Netlify

**Deploy your own instance in 3 clicks:**

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/JonasVanHove/GigsManager)

### Manual Deployment

1. **Connect Repository**
   - Go to [app.netlify.com](https://app.netlify.com)
   - **Add new site** → **Import from Git**
   - Select your forked repo

2. **Configure Environment**
   - **Site settings** → **Environment variables**
   - Add all variables from `.env` (see table below)

3. **Deploy**
   - Netlify auto-deploys on every push to `main`
   - First build takes ~2 minutes

4. **Run Migrations** (one-time)
   ```bash
   npx prisma migrate deploy
   ```

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase pooled connection | `postgresql://...6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Supabase direct connection | `postgresql://...5432/postgres` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | `eyJhbGciOiJIUzI1NiI...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key | `eyJhbGciOiJIUzI1NiI...` |
| `RESEND_API_KEY` | Email service key (optional) | `re_xxxxxxxxxxxxx` |
| `SUPABASE_WEBHOOK_SECRET` | Webhook secret (optional) | `whsec_xxxxxxxxxxxxx` |
| `NEXT_PUBLIC_APP_URL` | Your deployed URL | `https://gigsmanager.netlify.app` |

---

## 📁 Project Structure

```
GigsManager/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth-webhook/    # Supabase auth webhook handler
│   │   │   ├── gigs/            # CRUD API routes
│   │   │   └── health/          # Health check + DB ping
│   │   ├── globals.css          # Tailwind + custom styles
│   │   ├── layout.tsx           # Root layout with metadata
│   │   └── page.tsx             # Dashboard entry point
│   ├── components/
│   │   ├── Dashboard.tsx        # Main dashboard with summary
│   │   ├── LandingPage.tsx      # Marketing landing page
│   │   ├── GigCard.tsx          # Individual gig display
│   │   ├── GigForm.tsx          # Add/edit modal with live calc
│   │   ├── LoginForm.tsx        # Auth form component
│   │   └── DeleteConfirm.tsx    # Delete confirmation dialog
│   ├── lib/
│   │   ├── prisma.ts            # Prisma client singleton
│   │   ├── supabase.ts          # Supabase client (server/client)
│   │   ├── email-service.ts     # Resend email functions
│   │   ├── email-templates.tsx  # Branded HTML email templates
│   │   ├── calculations.ts      # Financial calculation engine
│   │   └── version.ts           # Auto-generated version info
│   └── types/
│       └── index.ts             # Shared TypeScript types
├── prisma/
│   ├── schema.prisma            # Database schema + indexes
│   ├── seed.ts                  # Demo data seeder
│   └── migrations/              # Prisma migrations
├── .github/workflows/
│   ├── ci.yml                   # Lint + build on push
│   └── keepalive.yml            # Database keep-alive cron
├── public/
│   └── favicon.png              # GM branded favicon
├── EMAIL_SETUP_GUIDE.md         # Complete email setup guide
├── netlify.toml                 # Netlify build config
└── package.json                 # Dependencies + scripts
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/gigs` | List all gigs (newest first) · Supports `?take=10&skip=0` |
| `POST` | `/api/gigs` | Create new gig · Validates input schema |
| `GET` | `/api/gigs/:id` | Get single gig by ID |
| `PUT` | `/api/gigs/:id` | Update existing gig |
| `DELETE` | `/api/gigs/:id` | Delete gig (soft delete) |
| `GET` | `/api/health` | Health check · Returns DB latency |
| `POST` | `/api/auth-webhook` | Supabase auth events · Triggers branded emails |

---

## 🧮 Financial Calculations

GigsManager automatically calculates all earnings and splits:

### Calculation Logic

```typescript
// 1. Adjust musician count if manager doesn't perform
const effectiveMusicians = claimPerformanceFee 
  ? numberOfMusicians 
  : numberOfMusicians - 1;

// 2. Calculate per-musician share
const perMusicianShare = performanceFee / effectiveMusicians;

// 3. Calculate manager bonus
const actualBonus = bonusType === "fixed"
  ? bonusAmount
  : (performanceFee * bonusAmount) / 100;

// 4. Calculate manager earnings
const myEarnings = (claimPerformanceFee ? perMusicianShare : 0)
  + technicalFee 
  + actualBonus;

// 5. Calculate amount owed to other musicians
const oweToOthers = claimPerformanceFee
  ? (numberOfMusicians - 1) * perMusicianShare
  : numberOfMusicians * perMusicianShare;
```

### Example Scenarios

**Scenario 1: Manager performs in a 4-piece band**
- Performance Fee: €800
- Number of Musicians: 4
- Manager Claims Performance Fee: ✅ Yes
- Technical Fee: €50
- Manager Bonus: €100 (fixed)

**Results:**
- Per Musician: €200 (€800 ÷ 4)
- My Earnings: €350 (€200 + €50 + €100)
- Owe to Band: €600 (3 × €200)

**Scenario 2: Manager books but doesn't perform**
- Performance Fee: €800
- Number of Musicians: 4
- Manager Claims Performance Fee: ❌ No
- Technical Fee: €50
- Manager Bonus: 10% (percentage)

**Results:**
- Per Musician: €200 (€800 ÷ 4, all 4 performers get equal share)
- My Earnings: €130 (€0 + €50 + €80)
- Owe to Band: €800 (4 × €200, I owe everyone)

---

## 📜 Available Scripts

```bash
# Development
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build
npm run lint             # ESLint check

# Database
npm run db:migrate       # Create + run migration (dev)
npm run db:migrate:deploy # Apply migrations (production)
npm run db:seed          # Seed demo data
npm run db:studio        # Open Prisma Studio (DB browser)
npm run db:reset         # Reset DB + re-seed

# Versioning (auto-updates footer version)
npm run release:patch    # Bug fixes (1.8.0 → 1.8.1)
npm run release:minor    # New features (1.8.0 → 1.9.0)
npm run release:major    # Breaking changes (1.8.0 → 2.0.0)
```

---

## 🗺️ Roadmap

### ✅ Completed (v1.8.0)
- [x] Dashboard with financial summary cards
- [x] Full CRUD for gigs with optimistic UI
- [x] Automatic earnings calculations
- [x] Mobile-responsive design with hamburger menu
- [x] Collapsible overview section with localStorage
- [x] Professional branded email system (Resend)
- [x] Supabase Auth with email verification
- [x] Marketing landing page
- [x] Netlify deployment with auto-builds

### 🚧 In Progress (v1.9.0)
- [ ] **Multi-user authentication** — Each user sees only their gigs
- [ ] **Team/band management** — Multiple bands per manager
- [ ] **Advanced filtering** — By date range, venue, payment status
- [ ] **CSV/PDF export** — Download financial reports
- [ ] **Dark mode toggle** — User preference with system detection

### 🔮 Future Ideas (v2.0+)
- [ ] **Calendar view** — Visual timeline of upcoming gigs
- [ ] **Recurring gigs** — Template for regular performances
- [ ] **Expense tracking** — Deduct costs from earnings
- [ ] **Multi-currency support** — EUR, USD, GBP
- [ ] **Mobile app** — React Native version
- [ ] **Stripe integration** — Direct payment processing
- [ ] **Analytics dashboard** — Charts, trends, insights

**Want to contribute?** See [Contributing](#-contributing) below!

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Bugs
- Open an issue with detailed reproduction steps
- Include screenshots, error logs, and environment info

### Suggesting Features
- Check existing issues first to avoid duplicates
- Describe the problem your feature solves
- Provide mockups or examples if possible

### Pull Requests
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style (ESLint + Prettier)
- Write descriptive commit messages ([Conventional Commits](https://www.conventionalcommits.org/))
- Update documentation for new features
- Test thoroughly before submitting

---

## 📄 License

**MIT License** — See [LICENSE](LICENSE) file for details.

```
Copyright (c) 2026 Jonas Van Hove

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

## 🙏 Acknowledgments

Built with amazing open-source projects:
- [Next.js](https://nextjs.org) — The React Framework
- [Supabase](https://supabase.com) — Open Source Firebase Alternative
- [Prisma](https://www.prisma.io) — Next-generation ORM
- [Tailwind CSS](https://tailwindcss.com) — Utility-first CSS
- [Resend](https://resend.com) — Email for Developers
- [Netlify](https://www.netlify.com) — Deploy modern web projects
- [Lucide](https://lucide.dev) — Beautiful icon library

---

## 📞 Support

- **Documentation:** [EMAIL_SETUP_GUIDE.md](EMAIL_SETUP_GUIDE.md)
- **Issues:** [GitHub Issues](https://github.com/JonasVanHove/GigsManager/issues)
- **Live Demo:** [gigsmanager.netlify.app](https://gigsmanager.netlify.app)

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

Made with ❤️ by [Jonas Van Hove](https://github.com/JonasVanHove)

[Report Bug](https://github.com/JonasVanHove/GigsManager/issues) · [Request Feature](https://github.com/JonasVanHove/GigsManager/issues) · [Live Demo](https://gigsmanager.netlify.app)

</div>
