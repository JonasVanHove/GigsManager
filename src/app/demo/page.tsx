"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase-client";
import {
  DEMO_EMAIL,
  DEMO_LOGIN_ENABLED,
  DEMO_PASSWORD,
  isDemoAccount,
  markDemoLoginPending,
} from "@/lib/demo-account";

type DemoState = "signing-in" | "error";

export default function DemoLoginPage() {
  const router = useRouter();
  const [state, setState] = useState<DemoState>("signing-in");
  const [message, setMessage] = useState<string>("Inloggen op de demo-omgeving…");
  const started = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; the ref keeps it to one login.
    if (started.current) return;
    started.current = true;

    if (!DEMO_LOGIN_ENABLED) {
      setState("error");
      setMessage("De demo-login is uitgeschakeld op deze installatie.");
      return;
    }

    const run = async () => {
      try {
        const { data: current } = await supabaseClient.auth.getSession();
        if (isDemoAccount(current.session?.user?.email)) {
          markDemoLoginPending();
          router.replace("/app");
          return;
        }

        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });

        if (error || !data.session) {
          throw new Error(error?.message || "Demo-login mislukt");
        }

        markDemoLoginPending();
        router.replace("/app");
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        if (raw.toLowerCase().includes("invalid login credentials")) {
          setMessage(
            "Het demo-account bestaat nog niet. Voer eerst `npm run db:seed:demo` uit (of `npm run db:seed:demo:reset`) om demo@gigsmanager.app aan te maken."
          );
        } else if (raw.toLowerCase().includes("fetch")) {
          setMessage("Geen verbinding met de authenticatieserver. Controleer je internetverbinding.");
        } else {
          setMessage(`Demo-login mislukt: ${raw}`);
        }
        setState("error");
      }
    };

    void run();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-4 text-center text-white">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-white/10">
        <img src="/favicon.png" alt="GigsManager" className="h-full w-full object-cover" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Gigs<span className="bg-gradient-to-r from-brand-400 to-orange-400 bg-clip-text text-transparent">Manager</span>{" "}
          Demo
        </h1>
        <p className="text-sm text-slate-500">Live voorbeeld met gigs, setlists, gages en financiën.</p>
      </div>

      {state === "signing-in" ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300 backdrop-blur">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          {message}
        </div>
      ) : (
        <div className="max-w-md space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          <p>{message}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Naar de homepage
            </button>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
            >
              Opnieuw proberen
            </button>
          </div>
        </div>
      )}

      <p className="max-w-md text-xs text-slate-500">
        Dit is een gedeeld demo-account. Alles wat je aanpast is zichtbaar voor andere bezoekers van deze demo.
      </p>
    </div>
  );
}