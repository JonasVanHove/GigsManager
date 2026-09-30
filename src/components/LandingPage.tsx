"use client";

import { useState } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";
import { Icons } from "./Icons";

// Icon component references for backward compatibility
const MusicIcon = Icons.Music;
const DollarIcon = Icons.Wallet;
const UsersIcon = Icons.People;
const CalendarIcon = Icons.Calendar;
const ChartIcon = Icons.Analytics;
const ShieldIcon = Icons.AlertTriangle;
const CogIcon = Icons.Settings;
const CheckIcon = Icons.Check;

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
    <div className="min-h-screen bg-white dark:bg-transparent transition-colors">
      {/* -- Navbar ------------------------------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg transition-colors">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg shadow-sm overflow-hidden">
              <Image
                src="/favicon.png"
                alt="GigsManager"
                width={36}
                height={36}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Gigs<span className="text-gold-600 dark:text-gold-400">Manager</span>
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
      <section className="relative overflow-hidden bg-white dark:bg-transparent transition-colors">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-brand-100/60 dark:bg-brand-500/20 blur-3xl" />
          <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-orange-100/40 dark:bg-orange-500/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-3xl text-center space-y-6 animate-fade-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-gold-50 dark:bg-gold-950 px-4 py-1.5 text-sm font-medium text-gold-700 dark:text-gold-300 ring-1 ring-gold-200 dark:ring-gold-800 animate-scale-in">
              <MusicIcon className="h-4 w-4" />
              Built for live music professionals
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl animate-slide-in-down">
              Manage your gigs,{" "}
              <span className="bg-gradient-to-r from-brand-600 to-orange-500 dark:from-brand-400 dark:to-orange-400 bg-clip-text text-transparent">
                not spreadsheets
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-slate-600 dark:text-slate-400 sm:text-xl animate-fade-in" style={{ animationDelay: "0.2s" }}>
              GigsManager helps musicians and band managers track performances,
              split fees, and manage payments — all in one simple dashboard.
              Stop juggling spreadsheets and start focusing on the music.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center animate-fade-in" style={{ animationDelay: "0.4s" }}>
              <button
                onClick={() => {
                  setShowAuth(true);
                  setTimeout(() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }), 50);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 hover:shadow-brand-600/30 active:bg-brand-800"
              >
                Start for Free
                <Icons.ChevronRight className="h-4 w-4" />
              </button>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                See Features
                <Icons.ChevronDown className="h-4 w-4" />
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
                      <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase">Performance</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">€1,200</p>
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase">Technical</p>
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
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-brand-200/30 dark:from-brand-500/10 via-orange-200/20 dark:via-orange-500/5 to-brand-200/30 dark:to-brand-500/10 blur-2xl" />
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
      <section className="py-20 sm:py-28 bg-white dark:bg-transparent transition-colors">
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
            <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-orange-600 p-8 text-white shadow-xl sm:p-10">
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
        className="border-t border-slate-100 dark:border-slate-800 bg-gradient-to-b from-slate-50 dark:from-slate-900/60 to-white dark:to-transparent py-20 sm:py-28 transition-colors"
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
                <Icons.ChevronRight className="h-4 w-4" />
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
            <div className="flex h-7 w-7 items-center justify-center rounded-md overflow-hidden">
              <Image
                src="/favicon.png"
                alt="GigsManager"
                width={28}
                height={28}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Gigs<span className="text-gold-600 dark:text-gold-400">Manager</span>
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
