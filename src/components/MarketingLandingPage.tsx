"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth, hasStoredSupabaseToken } from "./AuthProvider";
import { LoginForm } from "./LoginForm";
import { Icons } from "./Icons";
import LoadingSpinner from "./LoadingSpinner";

// -- Feature data ---------------------------------------------------------------

const features = [
  {
    icon: Icons.Calendar,
    title: "Gigs Tracking",
    description:
      "Log every performance with venue, date, band members, and notes. Never lose track of a booking again.",
    gradient: "from-blue-500 to-cyan-400",
  },
  {
    icon: Icons.ListView,
    title: "Setlist Builder",
    description:
      "Create and manage detailed setlists, reorder songs on the fly, and print production-ready PDFs for the stage.",
    gradient: "from-violet-500 to-fuchsia-400",
  },
  {
    icon: Icons.Analytics,
    title: "Band Analytics",
    description:
      "Deep insights into performance frequency, revenue trends, and band member earnings over any time range.",
    gradient: "from-amber-500 to-orange-400",
  },
  {
    icon: Icons.Wallet,
    title: "Financial Overview",
    description:
      "Automatic fee splits, per-musician calculations, pending payments, and multi-currency support at a glance.",
    gradient: "from-emerald-500 to-teal-400",
  },
  {
    icon: Icons.Link,
    title: "Shared Public Links",
    description:
      "Generate shareable, read-only links to gig overviews with granular control over what data is visible.",
    gradient: "from-rose-500 to-pink-400",
  },
  {
    icon: Icons.Music2,
    title: "Song Library",
    description:
      "A centralised repertoire with keys, tempo, capo positions, and lyrics — always ready for rehearsal or stage.",
    gradient: "from-indigo-500 to-blue-400",
  },
];

// -- Animated counter for stats -----------------------------------------------

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let frame = 0;
          const totalFrames = 40;
          const step = target / totalFrames;
          const animate = () => {
            frame++;
            setCount(Math.min(Math.round(step * frame), target));
            if (frame < totalFrames) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.4 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

// -- Landing Page Component ---------------------------------------------------

export function MarketingLandingPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [authTimeout, setAuthTimeout] = useState(false);

  // Zero-flash: redirect authenticated users to /app instantly
  useEffect(() => {
    if (!isLoading && session?.user) {
      setIsRedirecting(true);
      router.replace("/app");
    }
  }, [isLoading, session, router]);

  // Fail-safe for landing page: max 800ms spinner wait if stored token is pending verification
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      setAuthTimeout(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Determine if we should show the loading spinner:
  // Show spinner ONLY when authenticated user is redirecting, or when checking an existing stored token within 800ms.
  // Unauthenticated users (no stored token) see the landing page instantly without spinner.
  const hasToken = typeof window !== "undefined" ? hasStoredSupabaseToken() : false;
  const shouldShowSpinner = isRedirecting || (isLoading && hasToken && !authTimeout && !session?.user);

  if (shouldShowSpinner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <LoadingSpinner size="lg" message="Loading..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* -- Navbar ------------------------------------------------------ */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden ring-1 ring-white/10">
              <Image
                src="/favicon.png"
                alt="GigsManager"
                width={36}
                height={36}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Gigs<span className="bg-gradient-to-r from-brand-400 to-orange-400 bg-clip-text text-transparent">Manager</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                setShowAuth(true);
                setTimeout(
                  () => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }),
                  80
                );
              }}
              className="text-sm font-medium text-slate-400 transition hover:text-white"
            >
              Log In
            </button>
            <button
              onClick={() => {
                setShowAuth(true);
                setTimeout(
                  () => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }),
                  80
                );
              }}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:shadow-brand-500/30 hover:brightness-110 active:brightness-95"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </header>

      {/* -- Hero -------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-brand-600/20 blur-[128px]" />
          <div className="absolute right-0 top-1/3 h-[500px] w-[500px] rounded-full bg-violet-600/15 blur-[128px]" />
          <div className="absolute bottom-0 left-1/2 h-[400px] w-[400px] rounded-full bg-orange-500/10 blur-[100px]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:px-8 lg:pt-32 lg:pb-36">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-300 backdrop-blur-sm animate-fade-in">
              <Icons.Music className="h-4 w-4 text-brand-400" />
              Built for live music professionals
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-7xl leading-[1.1] animate-slide-in-down">
              Manage your gigs,{" "}
              <span className="bg-gradient-to-r from-brand-400 via-violet-400 to-orange-400 bg-clip-text text-transparent">
                not spreadsheets
              </span>
            </h1>

            <p
              className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl animate-fade-in"
              style={{ animationDelay: "0.15s" }}
            >
              Track performances, split fees, manage payments, and build setlists — all in one
              beautiful dashboard. Stop juggling spreadsheets and start focusing on the music.
            </p>

            <div
              className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center animate-fade-in"
              style={{ animationDelay: "0.3s" }}
            >
              <button
                onClick={() => {
                  setShowAuth(true);
                  setTimeout(
                    () => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }),
                    80
                  );
                }}
                className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-brand-500/25 transition-all hover:shadow-brand-500/40 hover:brightness-110 active:brightness-95"
              >
                Get Started Free
                <Icons.ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-base font-semibold text-slate-300 backdrop-blur-sm transition hover:bg-white/10 hover:text-white"
              >
                See Features
                <Icons.ChevronDown className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* -- Interactive preview card ------------------------------------- */}
          <div className="relative mx-auto mt-16 max-w-5xl animate-fade-in" style={{ animationDelay: "0.45s" }}>
            {/* Glow behind the card */}
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-brand-500/20 via-violet-500/10 to-orange-500/15 blur-3xl" />

            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 shadow-2xl backdrop-blur-xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 rounded-t-xl bg-slate-800/80 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs text-slate-500 font-mono">gigsmanager.com/app</span>
              </div>

              {/* Dashboard mockup */}
              <div className="rounded-b-xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 sm:p-6">
                {/* KPI row */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                  {[
                    { label: "Total Gigs", value: "48", icon: Icons.Calendar, color: "text-slate-200" },
                    { label: "My Earnings", value: "€24,150", icon: Icons.Wallet, color: "text-emerald-400" },
                    { label: "Pending", value: "5", icon: Icons.Clock, color: "text-amber-400" },
                    { label: "Owe to Band", value: "€1,240", icon: Icons.People, color: "text-rose-400" },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-xl border border-white/5 bg-white/5 p-3 sm:p-4 backdrop-blur"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <kpi.icon className="h-3 w-3 text-slate-500" />
                        <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">
                          {kpi.label}
                        </p>
                      </div>
                      <p className={`text-lg sm:text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                    </div>
                  ))}
                </div>

                {/* Sample gig card */}
                <div className="mt-3 rounded-xl border border-white/5 bg-white/5 p-4 backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate">Jazz Cafe Summer Session</h3>
                      <p className="mt-0.5 text-sm text-slate-400 truncate">
                        Aug 15, 2026 · The Blue Note Quartet · 4 musicians
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                      Client Paid
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    {[
                      { label: "Performance", value: "€1,200", color: "text-slate-300" },
                      { label: "Technical", value: "€200", color: "text-slate-300" },
                      { label: "My Earnings", value: "€700", color: "text-brand-400" },
                      { label: "Owe to Others", value: "€900", color: "text-amber-400" },
                    ].map((col) => (
                      <div key={col.label}>
                        <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase">{col.label}</p>
                        <p className={`font-semibold ${col.color}`}>{col.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- Features ---------------------------------------------------- */}
      <section
        id="features"
        className="relative border-t border-white/5 py-20 sm:py-28"
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute right-1/4 top-0 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Everything you need to{" "}
              <span className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                manage your music career
              </span>
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              From booking to payment, GigsManager handles the financial complexity so you can focus on performing.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04] hover:-translate-y-1"
              >
                {/* Gradient icon container */}
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg`}>
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>

                {/* Subtle hover glow */}
                <div className={`absolute -inset-px -z-10 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-[0.07]`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- Stats / Social Proof ---------------------------------------- */}
      <section className="border-t border-white/5 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: 100, suffix: "%", label: "Free Forever" },
              { value: 13, suffix: "+", label: "Currencies" },
              { value: 1, suffix: "s", label: "Calculations" },
              { value: 0, suffix: "", label: "Ads or Tracking", display: "Zero" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-extrabold sm:text-4xl bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                  {stat.display ?? <AnimatedCounter target={stat.value} suffix={stat.suffix} />}
                </p>
                <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- Why GigsManager --------------------------------------------- */}
      <section className="border-t border-white/5 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Why musicians love{" "}
                <span className="bg-gradient-to-r from-brand-400 to-orange-400 bg-clip-text text-transparent">
                  GigsManager
                </span>
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Built by musicians, for musicians. We know the pain of tracking payments after a
                gig — so we made something simple that actually works.
              </p>

              <ul className="mt-8 space-y-3">
                {[
                  "Free to use — no credit card required",
                  "Works on desktop, tablet, and mobile",
                  "Instant financial calculations",
                  "Multi-currency support (EUR, USD, GBP, …)",
                  "Export-ready data for your accounting",
                  "No ads, no tracking, no nonsense",
                ].map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 ring-1 ring-brand-500/20">
                      <Icons.Check className="h-3.5 w-3.5 text-brand-400" />
                    </div>
                    <span className="text-slate-300">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Gradient stats card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-8 text-white shadow-2xl sm:p-10">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

              <div className="relative">
                <h3 className="text-lg font-medium text-brand-200">Built for simplicity</h3>
                <p className="mt-3 text-3xl font-bold sm:text-4xl leading-tight">
                  From gig to payment in under 60&nbsp;seconds
                </p>
                <p className="mt-4 text-brand-200 leading-relaxed">
                  Add a performance, enter the fees, and GigsManager instantly calculates each
                  musician's share, your earnings, and what you owe. No formulas, no mistakes, no stress.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- Pricing / Donation ------------------------------------------- */}
      <section className="relative border-t border-white/5 py-20 sm:py-28">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-orange-500/10 blur-[120px]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Simple,{" "}
              <span className="bg-gradient-to-r from-brand-400 to-orange-400 bg-clip-text text-transparent">
                transparent pricing
              </span>
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Choose the plan that fits your needs. Free forever for individual musicians.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Free Tier */}
            <div className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <Icons.Music className="h-5 w-5 text-brand-400" />
                <h3 className="text-lg font-semibold text-white">Free / Musician</h3>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-white">€0</span>
                <span className="text-slate-400">/month</span>
              </div>
              <p className="text-sm text-slate-400 mb-6">
                Perfect for individual musicians tracking their gigs and earnings.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "Unlimited gig tracking",
                  "Setlist management",
                  "Financial calculations",
                  "Multi-currency support",
                  "Mobile & desktop access",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                    <Icons.Check className="h-4 w-4 text-brand-400" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setShowAuth(true);
                  setTimeout(
                    () => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }),
                    80
                  );
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Get Started Free
              </button>
            </div>

            {/* Supporter Tier */}
            <div className="relative rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-orange-500/10 p-6 backdrop-blur-sm">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-brand-500 to-orange-500 px-3 py-1 text-xs font-semibold text-white">
                  Support Us
                </span>
              </div>
              <div className="flex items-center gap-2 mb-4 mt-2">
                <Icons.Heart className="h-5 w-5 text-orange-400" />
                <h3 className="text-lg font-semibold text-white">Supporter / Donatie</h3>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-white">€5+</span>
                <span className="text-slate-400">/month</span>
              </div>
              <p className="text-sm text-slate-400 mb-6">
                Support the development of GigsManager and help keep it free for everyone.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "Everything in Free",
                  "Support open-source development",
                  "Priority feature requests",
                  "Early access to new features",
                  "Your name in supporters list",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                    <Icons.Check className="h-4 w-4 text-brand-400" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setShowDonationModal(true)}
                className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:shadow-brand-500/30 hover:brightness-110"
              >
                Support via Donatie
              </button>
            </div>

            {/* Pro Tier */}
            <div className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <Icons.People className="h-5 w-5 text-violet-400" />
                <h3 className="text-lg font-semibold text-white">Pro / Band Manager</h3>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-white">€15</span>
                <span className="text-slate-400">/month</span>
              </div>
              <p className="text-sm text-slate-400 mb-6">
                For band managers and professional musicians managing multiple acts.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "Everything in Free",
                  "Unlimited band management",
                  "Advanced analytics & reports",
                  "Team collaboration tools",
                  "Priority support",
                  "Custom branding options",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                    <Icons.Check className="h-4 w-4 text-brand-400" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setShowAuth(true);
                  setTimeout(
                    () => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }),
                    80
                  );
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Contact for Pro
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* -- Donation Modal ------------------------------------------------ */}
      {showDonationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDonationModal(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl backdrop-blur-xl">
            <button
              onClick={() => setShowDonationModal(false)}
              className="absolute right-4 top-4 text-slate-400 transition hover:text-white"
            >
              <Icons.X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center gap-2 mb-4">
              <Icons.Heart className="h-5 w-5 text-orange-400" />
              <h3 className="text-xl font-semibold text-white">Support GigsManager</h3>
            </div>
            
            <p className="text-sm text-slate-400 mb-6">
              Thank you for considering supporting GigsManager! Your donation helps keep the project free and open-source for all musicians.
            </p>
            
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Direct Bank Transfer</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">IBAN:</span>
                    <span className="text-white font-mono">BE46 7390 1188 6036</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Account holder:</span>
                    <span className="text-white">GigsManager Support</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setShowDonationModal(false)}
                className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:shadow-brand-500/30 hover:brightness-110"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- CTA / Auth -------------------------------------------------- */}
      <section
        id="auth-section"
        className="relative border-t border-white/5 py-20 sm:py-28"
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-brand-600/15 blur-[128px]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {showAuth ? "Welcome back" : "Ready to get started?"}
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              {showAuth
                ? "Sign in to your account or create a new one."
                : "Create your free account and start tracking your gigs in minutes."}
            </p>

            {!showAuth && (
              <button
                onClick={() => setShowAuth(true)}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-brand-500/25 transition-all hover:shadow-brand-500/40 hover:brightness-110"
              >
                Create Free Account
                <Icons.ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {showAuth && (
            <div className="mt-10 flex justify-center animate-fade-in">
              <LoginForm />
            </div>
          )}
        </div>
      </section>

      {/* -- Footer ------------------------------------------------------ */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md overflow-hidden ring-1 ring-white/10">
              <Image
                src="/favicon.png"
                alt="GigsManager"
                width={28}
                height={28}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="text-sm font-semibold">
              Gigs<span className="bg-gradient-to-r from-brand-400 to-orange-400 bg-clip-text text-transparent">Manager</span>
            </span>
          </div>
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} GigsManager. Free and open-source.
          </p>
        </div>
      </footer>
    </div>
  );
}
