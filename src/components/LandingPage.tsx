"use client";

import { useState } from "react";
import { LoginForm } from "./LoginForm";

// -- Icon Components ----------------------------------------------------------

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

// -- Feature data -------------------------------------------------------------

const features = [
  {
    icon: CalendarIcon,
    title: "Gig Tracking",
    description: "Log every performance with venue, date, band members, and notes. Never lose track of a booking again.",
  },
  {
    icon: DollarIcon,
    title: "Financial Breakdown",
    description: "Automatically split performance fees, technical fees, and manager bonuses among musicians.",
  },
  {
    icon: UsersIcon,
    title: "Band Payments",
    description: "Track who's been paid and who hasn't. See at a glance what you owe to other musicians.",
  },
  {
    icon: ChartIcon,
    title: "Earnings Overview",
    description: "Dashboard with total earnings, pending payments, and outstanding amounts — all in real time.",
  },
  {
    icon: CogIcon,
    title: "Customizable Settings",
    description: "Choose your currency, configure which fees you claim. Tailor it to how your band operates.",
  },
  {
    icon: ShieldIcon,
    title: "Private & Secure",
    description: "Your data is yours. Each account sees only their own gigs. Secured by Supabase authentication.",
  },
];

const benefits = [
  "Free to use — no credit card required",
  "Works on desktop, tablet, and mobile",
  "Instant financial calculations",
  "Multi-currency support (EUR, USD, GBP, …)",
  "Export-ready data for your accounting",
  "No ads, no tracking, no nonsense",
];

// -- Landing Page -------------------------------------------------------------

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors">
      {/* -- Navbar ------------------------------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg transition-colors">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 shadow-sm">
              <MusicIcon className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Gigs<span className="text-brand-600 dark:text-brand-400">Manager</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setShowAuth(true);
                setTimeout(() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }), 50);
              }}
              className="text-sm font-medium text-slate-600 dark:text-slate-400 transition hover:text-brand-600 dark:hover:text-brand-400"
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setShowAuth(true);
                setTimeout(() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }), 50);
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 active:bg-brand-800"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* -- Hero -------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-white dark:bg-slate-950 transition-colors">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-brand-100/60 dark:bg-brand-500/20 blur-3xl" />
          <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-indigo-100/40 dark:bg-indigo-500/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 dark:bg-brand-950 px-4 py-1.5 text-sm font-medium text-brand-700 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800">
              <MusicIcon className="h-4 w-4" />
              Built for live music professionals
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
              Manage your gigs,{" "}
              <span className="bg-gradient-to-r from-brand-600 to-indigo-600 dark:from-brand-400 dark:to-indigo-400 bg-clip-text text-transparent">
                not spreadsheets
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-slate-600 dark:text-slate-400 sm:text-xl">
              GigsManager helps musicians and band managers track performances,
              split fees, and manage payments — all in one simple dashboard.
              Stop juggling spreadsheets and start focusing on the music.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <button
                onClick={() => {
                  setShowAuth(true);
                  setTimeout(() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }), 50);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 hover:shadow-brand-600/30 active:bg-brand-800"
              >
                Start for Free
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                See Features
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
                </svg>
              </a>
            </div>
          </div>

          {/* -- Dashboard preview --------------------------------------- */}
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-2xl shadow-slate-200/50 dark:shadow-slate-950/50">
              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 sm:p-8">
                {/* Fake dashboard summary */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                  {[
                    { label: "Total Gigs", value: "24", color: "text-slate-900" },
                    { label: "My Earnings", value: "€12,450", color: "text-brand-700" },
                    { label: "Pending", value: "3", color: "text-amber-700" },
                    { label: "Owe to Band", value: "€820", color: "text-red-700" },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm"
                    >
                      <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">
                        {card.label}
                      </p>
                      <p className={`mt-1 text-lg sm:text-xl font-bold ${card.color}`}>
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Fake gig card */}
                <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">Jazz Cafe Summer Session</h3>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Aug 15, 2026 &middot; The Blue Note Quartet &middot; 4 musicians</p>
                    </div>
                    <div className="flex gap-1">
                      <span className="rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20 dark:ring-emerald-500/30">
                        Client Paid
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Performance</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">€1,200</p>
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Technical</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">€200</p>
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-brand-500 dark:text-brand-400 uppercase">My Earnings</p>
                      <p className="font-bold text-brand-700 dark:text-brand-300">€700</p>
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-amber-500 dark:text-amber-400 uppercase">Owe to Others</p>
                      <p className="font-semibold text-amber-700 dark:text-amber-300">€900</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Glow effect */}
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-brand-200/30 dark:from-brand-500/10 via-indigo-200/20 dark:via-indigo-500/5 to-brand-200/30 dark:to-brand-500/10 blur-2xl" />
          </div>
        </div>
      </section>

      {/* -- Features ---------------------------------------------------- */}
      <section id="features" className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 py-20 sm:py-28 transition-colors">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Everything you need to manage your gigs
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
              From booking to payment, GigsManager handles the financial complexity so you can focus on performing.
            </p>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm transition hover:shadow-md hover:border-brand-200 dark:hover:border-brand-600"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 transition group-hover:bg-brand-600 group-hover:text-white">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- Benefits ---------------------------------------------------- */}
      <section className="py-20 sm:py-28 bg-white dark:bg-slate-950/50 transition-colors">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Why choose GigsManager?
              </h2>
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
                Built by musicians, for musicians. We know the pain of tracking payments after a
                gig — so we made something simple that actually works.
              </p>

              <ul className="mt-8 space-y-3">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-slate-700 dark:text-slate-300">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Stats block */}
            <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 p-8 text-white shadow-xl sm:p-10">
              <h3 className="text-lg font-medium text-brand-100">Built for simplicity</h3>
              <p className="mt-3 text-3xl font-bold sm:text-4xl">
                From gig to payment in under 60 seconds
              </p>
              <p className="mt-4 text-brand-200 leading-relaxed">
                Add a performance, enter the fees, and GigsManager instantly calculates
                each musician's share, your earnings, and what you owe. No formulas, no
                mistakes, no stress.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/20 pt-8">
                <div>
                  <p className="text-2xl font-bold sm:text-3xl">100%</p>
                  <p className="mt-1 text-sm text-brand-200">Free</p>
                </div>
                <div>
                  <p className="text-2xl font-bold sm:text-3xl">13+</p>
                  <p className="mt-1 text-sm text-brand-200">Currencies</p>
                </div>
                <div>
                  <p className="text-2xl font-bold sm:text-3xl">&lt;1s</p>
                  <p className="mt-1 text-sm text-brand-200">Calculations</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- CTA / Auth Section ------------------------------------------ */}
      <section
        id="auth-section"
        className="border-t border-slate-100 dark:border-slate-800 bg-gradient-to-b from-slate-50 dark:from-slate-900 to-white dark:to-slate-950 py-20 sm:py-28 transition-colors"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {showAuth ? "Welcome back" : "Ready to get started?"}
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
              {showAuth
                ? "Sign in to your account or create a new one."
                : "Create your free account and start tracking your gigs in minutes."
              }
            </p>

            {!showAuth && (
              <button
                onClick={() => setShowAuth(true)}
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 active:bg-brand-800"
              >
                Create Free Account
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            )}
          </div>

          {showAuth && (
            <div className="mt-10 flex justify-center">
              <LoginForm />
            </div>
          )}
        </div>
      </section>

      {/* -- Footer ------------------------------------------------------ */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-10 transition-colors">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600">
              <MusicIcon className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Gigs<span className="text-brand-600 dark:text-brand-400">Manager</span>
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            &copy; {new Date().getFullYear()} GigsManager. Free and open-source.
          </p>
        </div>
      </footer>
    </div>
  );
}
