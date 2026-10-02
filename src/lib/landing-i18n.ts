"use client";

/**
 * Lightweight i18n for the public marketing landing page.
 *
 * English is the default. The visitor's choice is persisted in localStorage,
 * a long-lived cookie and (optionally) the ?lang= query parameter.
 *
 * This module is intentionally free of JSX so it can be imported from plain
 * Node tests; the provider lives in `src/components/LandingLanguageProvider.tsx`.
 *
 * Hydration-safe by design: the server render and the first client render both
 * use the default language, and the stored preference is applied in an effect
 * after mount. That prevents hydration mismatches while still restoring the
 * visitor's language immediately.
 */

import { createContext, useContext } from "react";

export type LandingLanguage = "en" | "nl" | "fr";

export const DEFAULT_LANDING_LANGUAGE: LandingLanguage = "en";

export const LANDING_LANGUAGES: Array<{ code: LandingLanguage; label: string; short: string }> = [
  { code: "en", label: "English", short: "EN" },
  { code: "nl", label: "Nederlands", short: "NL" },
  { code: "fr", label: "Français", short: "FR" },
];

export const LANDING_LANGUAGE_STORAGE_KEY = "gigsmanager:landing-language";
export const LANDING_LANGUAGE_COOKIE = "gm_lang";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

export function isLandingLanguage(value: unknown): value is LandingLanguage {
  return value === "en" || value === "nl" || value === "fr";
}

export function readStoredLanguage(): LandingLanguage | null {
  if (typeof window === "undefined") return null;

  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (isLandingLanguage(fromQuery)) return fromQuery;

  try {
    const stored = window.localStorage.getItem(LANDING_LANGUAGE_STORAGE_KEY);
    if (isLandingLanguage(stored)) return stored;
  } catch {
    // storage unavailable
  }

  try {
    const cookie = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${LANDING_LANGUAGE_COOKIE}=`));
    const value = cookie?.split("=")[1];
    if (isLandingLanguage(value)) return value;
  } catch {
    // cookies unavailable
  }

  return null;
}

export function persistLanguage(language: LandingLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANDING_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // ignore
  }
  try {
    document.cookie = `${LANDING_LANGUAGE_COOKIE}=${language}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // ignore
  }
}

// -- English (source of truth) ---------------------------------------------
const en = {
  nav: {
    liveDemo: "Live demo",
    logIn: "Log In",
    getStarted: "Get Started Free",
    menu: "Menu",
    closeMenu: "Close menu",
    features: "Features",
    language: "Language",
    selectLanguage: "Select language",
  },
  hero: {
    badge: "Built for live music professionals",
    titleLead: "Manage your gigs,",
    titleAccent: "not spreadsheets",
    subtitle:
      "Track performances, split fees, manage payments, and build setlists — all in one beautiful dashboard. Stop juggling spreadsheets and start focusing on the music.",
    subline:
      "Every gig, every setlist and every euro in one place. No setup calls, no spreadsheets — open your first gig in under two minutes.",
    primaryCta: "Get Started Free",
    demoCta: "Open live demo",
    featuresCta: "See Features",
    demoNote: "The demo opens instantly — no account, no password.",
  },
  preview: {
    url: "gigsmanager.com/app",
    kpiTotalGigs: "Total Gigs",
    kpiMyEarnings: "My Earnings",
    kpiPending: "Pending",
    kpiOweToBand: "Owe to Band",
    gigName: "Jazz Cafe Summer Session",
    gigMeta: "Aug 15, 2026 · The Blue Note Quartet · 4 musicians",
    clientPaid: "Client Paid",
    colPerformance: "Performance",
    colTechnical: "Technical",
    colMyEarnings: "My Earnings",
    colOweToOthers: "Owe to Others",
  },
  features: {
    titleLead: "Everything you need to",
    titleAccent: "manage your music career",
    subtitle:
      "From booking to payment, GigsManager handles the financial complexity so you can focus on performing.",
    items: [
      {
        title: "Gig Tracking",
        description:
          "Log every performance with venue, date, band members, and notes. Never lose track of a booking again.",
      },
      {
        title: "Setlist Builder",
        description:
          "Create and manage detailed setlists, reorder songs on the fly, and print production-ready PDFs for the stage.",
      },
      {
        title: "Band Analytics",
        description:
          "Deep insights into performance frequency, revenue trends, and band member earnings over any time range.",
      },
      {
        title: "Financial Overview",
        description:
          "Automatic fee splits, per-musician calculations, pending payments, and multi-currency support at a glance.",
      },
      {
        title: "Shared Public Links",
        description:
          "Generate shareable, read-only links to gig overviews with granular control over what data is visible.",
      },
      {
        title: "Song Library",
        description:
          "A centralised repertoire with keys, tempo, capo positions, and lyrics — always ready for rehearsal or stage.",
      },
    ],
  },
  stats: {
    freeForever: "Free Forever",
    currencies: "Currencies",
    calculations: "Calculations",
    ads: "Ads or Tracking",
    zero: "Zero",
  },
why: {
    titleLead: "Why musicians love",
    titleAccent: "GigsManager",
    subtitle:
      "Built by musicians, for musicians. We know the pain of tracking payments after a gig — so we made something simple that actually works.",
    benefits: [
      "Free to use — no credit card required",
      "Works on desktop, tablet, and mobile",
      "Instant financial calculations",
      "Multi-currency support (EUR, USD, GBP, …)",
      "Export-ready data for your accounting",
      "No ads, no tracking, no nonsense",
    ],
    card: {
      eyebrow: "Built for simplicity",
      headline: "From gig to payment in under 60 seconds",
      body: "Add a performance, enter the fees, and GigsManager instantly calculates each musician's share, your earnings, and what you owe. No formulas, no mistakes, no stress.",
    },
  },
  pricing: {
    titleLead: "Simple,",
    titleAccent: "transparent pricing",
    subtitle: "Choose the plan that fits your needs. Free forever for individual musicians.",
    perMonth: "/month",
    free: {
      title: "Free / Musician",
      description: "Perfect for individual musicians tracking their gigs and earnings.",
      features: [
        "Unlimited gig tracking",
        "Setlist management",
        "Financial calculations",
        "Multi-currency support",
        "Mobile & desktop access",
      ],
      cta: "Get Started Free",
    },
    supporter: {
      badge: "Support Us",
      title: "Supporter / Donation",
      description: "Support the development of GigsManager and help keep it free for everyone.",
      features: [
        "Everything in Free",
        "Support open-source development",
        "Priority feature requests",
        "Early access to new features",
        "Your name in the supporters list",
      ],
      cta: "Support via Donation",
    },
    pro: {
      title: "Pro / Band Manager",
      description: "For band managers and professional musicians managing multiple acts.",
      features: [
        "Everything in Free",
        "Unlimited band management",
        "Advanced analytics & reports",
        "Team collaboration tools",
        "Priority support",
        "Custom branding options",
      ],
      cta: "Contact for Pro",
    },
  },
  donation: {
    title: "Support GigsManager",
    body: "Thank you for considering supporting GigsManager! Your donation helps keep the project free and open-source for all musicians.",
    bankTitle: "Direct Bank Transfer",
    iban: "IBAN:",
    accountHolder: "Account holder:",
    close: "Close",
  },
  auth: {
    readyTitle: "Ready to get started?",
    welcomeTitle: "Welcome back",
    startSubtitle: "Create your free account and start tracking your gigs in minutes.",
    signInSubtitle: "Sign in to your account or create a new one.",
    createCta: "Create Free Account",
    or: "or",
    demoLink: "See the demo first — no password needed",
  },
  footer: {
    tagline: "Free and open-source.",
  },
} as const;

/**
 * Keeps the *structure* of `en` as the source of truth (so a missing key in a
 * translation is a compile error) while widening the string values so other
 * languages can supply their own copy.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
  ? readonly Widen<U>[]
  : { readonly [K in keyof T]: Widen<T[K]> };

export type LandingCopy = Widen<typeof en>;
type Translations = Record<LandingLanguage, LandingCopy>;

// -- Dutch ------------------------------------------------------------------
const nl: LandingCopy = {
  nav: {
    liveDemo: "Live demo",
    logIn: "Inloggen",
    getStarted: "Gratis starten",
    menu: "Menu",
    closeMenu: "Menu sluiten",
    features: "Functies",
    language: "Taal",
    selectLanguage: "Kies een taal",
  },
  hero: {
    badge: "Gemaakt voor professionals uit de muziek",
    titleLead: "Beheer je optredens,",
    titleAccent: "geen spreadsheets",
    subtitle:
      "Registreer optredens, verdeel gages, beheer betalingen en bouw setlists — allemaal in één mooi dashboard. Stop met worstelen met spreadsheets en focus op het muzikale werk.",
    subline:
      "Elk optreden, elke setlist en elke euro op één plek. Geen opstartgesprekken, geen spreadsheets — je staat binnen twee minuten klaar.",
    primaryCta: "Gratis starten",
    demoCta: "Open de live demo",
    featuresCta: "Bekijk de functies",
    demoNote: "De demo opent direct — geen account, geen wachtwoord.",
  },
  preview: {
    url: "gigsmanager.com/app",
    kpiTotalGigs: "Optredens",
    kpiMyEarnings: "Mijn inkomsten",
    kpiPending: "Openstaand",
    kpiOweToBand: "Schuld aan band",
    gigName: "Jazz Café Summer Session",
    gigMeta: "15 aug 2026 · The Blue Note Quartet · 4 muzikanten",
    clientPaid: "Klant heeft betaald",
    colPerformance: "Optreden",
    colTechnical: "Techniek",
    colMyEarnings: "Mijn inkomsten",
    colOweToOthers: "Schuld aan anderen",
  },
  features: {
    titleLead: "Alles wat je nodig hebt om",
    titleAccent: "je muziekcarrière te runnen",
    subtitle:
      "Van boeking tot betaling: GigsManager regelt de financiële complexiteit zodat jij kunt focussen op muziek maken.",
    items: [
      {
        title: "Optredens bijhouden",
        description:
          "Leg elk optreden vast met locatie, datum, bandleden en notities. Verlies nooit meer een boeking.",
      },
      {
        title: "Setlist-builder",
        description:
          "Bouw en beheer gedetailleerde setlists, herschik nummers ter plekke en print productieklare PDF's voor het podium.",
      },
      {
        title: "Bandanalyses",
        description:
          "Diepgaande inzichten in speelfrequentie, inkomstenontwikkeling en verdiensten per bandlid, over elke periode.",
      },
      {
        title: "Financieel overzicht",
        description:
          "Automatische gageverdeling, berekeningen per muzikant, openstaande betalingen en meerdere valuta in één oogopslag.",
      },
      {
        title: "Publieke deellinks",
        description:
          "Maak deelbare, alleen-lezen links naar optredens, met precieze controle over welke data zichtbaar is.",
      },
      {
        title: "Nummerbibliotheek",
        description:
          "Eén repertoire met toonsoorten, tempo's, capo's en teksten — altijd klaar voor repetitie of podium.",
      },
    ],
  },
stats: {
    freeForever: "Altijd gratis",
    currencies: "Valuta",
    calculations: "Berekeningen",
    ads: "Reclame of tracking",
    zero: "Nul",
  },
  why: {
    titleLead: "Waarom muzikanten",
    titleAccent: "GigsManager",
    subtitle:
      "Gebouwd door muzikanten, voor muzikanten. We kennen het gedoe van betalingen bijhouden na een optreden — dus maakten we iets eenvoudigs dat echt werkt.",
    benefits: [
      "Gratis te gebruiken — geen creditcard nodig",
      "Werkt op desktop, tablet en mobiel",
      "Directe financiële berekeningen",
      "Meerdere valuta's (EUR, USD, GBP, …)",
      "Exportklare data voor je boekhouding",
      "Geen reclame, geen tracking, geen gedoe",
    ],
    card: {
      eyebrow: "Gebouwd voor eenvoud",
      headline: "Van optreden tot betaling in minder dan 60 seconden",
      body: "Voeg een optreden toe, vul de bedragen in, en GigsManager berekent direct het aandeel van elke muzikant, jouw inkomsten en wat je nog verschuldigd bent. Geen formules, geen fouten, geen stress.",
    },
  },
  pricing: {
    titleLead: "Eenvoudige,",
    titleAccent: "transparante prijzen",
    subtitle: "Kies het plan dat bij je past. Voor zelfstandige muzikanten altijd gratis.",
    perMonth: "/maand",
    free: {
      title: "Gratis / Muzikant",
      description: "Perfect voor zelfstandige muzikanten die hun optredens en inkomsten bijhouden.",
      features: [
        "Onbeperkt optredens bijhouden",
        "Setlistbeheer",
        "Financiële berekeningen",
        "Meerdere valuta's",
        "Toegang op mobiel en desktop",
      ],
      cta: "Gratis starten",
    },
    supporter: {
      badge: "Steun ons",
      title: "Supporter / Donatie",
      description: "Steun de ontwikkeling van GigsManager en houd het voor iedereen gratis.",
      features: [
        "Alles uit het gratis pakket",
        "Steun aan open-source ontwikkeling",
        "Prioriteit bij featureverzoeken",
        "Vroege toegang tot nieuwe functies",
        "Je naam op de supporterslijst",
      ],
      cta: "Steun met een donatie",
    },
    pro: {
      title: "Pro / Bandmanager",
      description: "Voor bandmanagers en professionele muzikanten met meerdere projecten.",
      features: [
        "Alles uit het gratis pakket",
        "Onbeperkt bandbeheer",
        "Geavanceerde analyses & rapporten",
        "Samenwerkingstools voor teams",
        "Prioriteitsondersteuning",
        "Eigen branding",
      ],
      cta: "Neem contact op voor Pro",
    },
  },
  donation: {
    title: "Steun GigsManager",
    body: "Bedankt dat je GigsManager wilt steunen! Met je donatie blijft het project gratis en open-source voor alle muzikanten.",
    bankTitle: "Directe overschrijving",
    iban: "IBAN:",
    accountHolder: "Rekeninghouder:",
    close: "Sluiten",
  },
  auth: {
    readyTitle: "Klaar om te beginnen?",
    welcomeTitle: "Welkom terug",
    startSubtitle: "Maak gratis een account aan en houd binnen enkele minuten je optredens bij.",
    signInSubtitle: "Log in op je account of maak er een nieuw aan.",
    createCta: "Gratis account aanmaken",
    or: "of",
    demoLink: "Bekijk eerst de demo — geen wachtwoord nodig",
  },
  footer: {
    tagline: "Gratis en open-source.",
  },
};

// -- French -----------------------------------------------------------------
const fr: LandingCopy = {
  nav: {
    liveDemo: "Démo en direct",
    logIn: "Connexion",
    getStarted: "Commencer gratuitement",
    menu: "Menu",
    closeMenu: "Fermer le menu",
    features: "Fonctionnalités",
    language: "Langue",
    selectLanguage: "Choisir une langue",
  },
  hero: {
    badge: "Conçu pour les professionnels de la musique",
    titleLead: "Gérez vos concerts,",
    titleAccent: "pas vos tableurs",
    subtitle:
      "Saisissez vos concerts, répartissez les gagas, suivez les paiements et composez vos setlists — le tout dans un seul tableau de bord élégant. Fini les tableurs, place à la musique.",
    subline:
      "Chaque concert, chaque setlist et chaque euro au même endroit. Aucun appel de configuration, aucun tableur — votre premier concert est prêt en moins de deux minutes.",
    primaryCta: "Commencer gratuitement",
    demoCta: "Ouvrir la démo",
    featuresCta: "Voir les fonctionnalités",
    demoNote: "La démo s'ouvre instantanément — ni compte, ni mot de passe.",
  },
  preview: {
    url: "gigsmanager.com/app",
    kpiTotalGigs: "Concerts",
    kpiMyEarnings: "Mes revenus",
    kpiPending: "En attente",
    kpiOweToBand: "Dû au groupe",
    gigName: "Jazz Café Summer Session",
    gigMeta: "15 août 2026 · The Blue Note Quartet · 4 musiciens",
    clientPaid: "Client payé",
    colPerformance: "Prestation",
    colTechnical: "Technique",
    colMyEarnings: "Mes revenus",
    colOweToOthers: "Dû aux autres",
  },
  features: {
    titleLead: "Tout ce qu'il faut pour",
    titleAccent: "piloter votre carrière musicale",
    subtitle:
      "De la réservation au paiement, GigsManager gère la complexité financière pour que vous puissiez vous concentrer sur la scène.",
    items: [
      {
        title: "Suivi des concerts",
        description:
          "Enregistrez chaque concert avec la salle, la date, les musiciens et vos notes. Ne perdez plus jamais une réservation.",
      },
      {
        title: "Créateur de setlists",
        description:
          "Créez des setlists détaillées, réorganisez les titres en cours de route et imprimez des PDF prêts pour la scène.",
      },
      {
        title: "Analyses du groupe",
        description:
          "Des analyses fines de la fréquence des concerts, des tendances de revenus et des gains de chaque musicien, sur toute période.",
      },
      {
        title: "Vue d'ensemble financière",
        description:
          "Répartition automatique des gagas, calculs par musicien, paiements en attente et multi-devises en un coup d'œil.",
      },
      {
        title: "Liens publics partagés",
        description:
          "Générez des liens partageables en lecture seule vers vos concerts, avec un contrôle précis des données visibles.",
      },
      {
        title: "Bibliothèque de titres",
        description:
          "Un répertoire centralisé avec tonalités, tempos, capos et paroles — toujours prêt pour la répétition ou la scène.",
      },
    ],
  },
stats: {
    freeForever: "Gratuit à vie",
    currencies: "Devises",
    calculations: "Calculs",
    ads: "Publicité ou tracking",
    zero: "Zéro",
  },
  why: {
    titleLead: "Pourquoi les musiciens",
    titleAccent: "aiment GigsManager",
    subtitle:
      "Créé par des musiciens, pour des musiciens. Nous connaissons la galère de suivre les paiements après un concert — nous avons donc fait un outil simple qui fonctionne vraiment.",
    benefits: [
      "Gratuit — aucune carte bancaire requise",
      "Fonctionne sur ordinateur, tablette et mobile",
      "Calculs financiers instantanés",
      "Multi-devises (EUR, USD, GBP, …)",
      "Données prêtes à exporter pour votre comptabilité",
      "Pas de pub, pas de tracking, pas de blabla",
    ],
    card: {
      eyebrow: "Pensé pour la simplicité",
      headline: "Du concert au paiement en moins de 60 secondes",
      body: "Ajoutez une prestation, saisissez les montants, et GigsManager calcule instantanément la part de chaque musicien, vos revenus et ce que vous devez. Sans formules, sans erreurs, sans stress.",
    },
  },
  pricing: {
    titleLead: "Une tarification",
    titleAccent: "simple et transparente",
    subtitle: "Choisissez l'offre qui vous convient. Gratuite à vie pour les musiciens indépendants.",
    perMonth: "/mois",
    free: {
      title: "Gratuit / Musicien",
      description: "Idéal pour les musiciens indépendants qui suivent leurs concerts et leurs revenus.",
      features: [
        "Suivi de concerts illimité",
        "Gestion des setlists",
        "Calculs financiers",
        "Multi-devises",
        "Accès mobile et ordinateur",
      ],
      cta: "Commencer gratuitement",
    },
    supporter: {
      badge: "Soutenez-nous",
      title: "Soutien / Don",
      description: "Soutenez le développement de GigsManager et aidez-le à rester gratuit pour tous.",
      features: [
        "Tout le plan gratuit",
        "Soutien au développement open-source",
        "Demandes de fonctionnalités prioritaires",
        "Accès anticipé aux nouveautés",
        "Votre nom dans la liste des soutiens",
      ],
      cta: "Soutenir par un don",
    },
    pro: {
      title: "Pro / Bandmanager",
      description: "Pour les band managers et les musiciens professionnels qui gèrent plusieurs projets.",
      features: [
        "Tout le plan gratuit",
        "Gestion illimitée de groupes",
        "Analyses et rapports avancés",
        "Outils de collaboration d'équipe",
        "Support prioritaire",
        "Options de marque personnalisée",
      ],
      cta: "Nous contacter pour Pro",
    },
  },
  donation: {
    title: "Soutenir GigsManager",
    body: "Merci d'envisager de soutenir GigsManager ! Votre don permet de garder le projet gratuit et open-source pour tous les musiciens.",
    bankTitle: "Virement bancaire direct",
    iban: "IBAN :",
    accountHolder: "Titulaire du compte :",
    close: "Fermer",
  },
  auth: {
    readyTitle: "Prêt à commencer ?",
    welcomeTitle: "Content de vous revoir",
    startSubtitle: "Créez votre compte gratuit et suivez vos concerts en quelques minutes.",
    signInSubtitle: "Connectez-vous à votre compte ou créez-en un nouveau.",
    createCta: "Créer un compte gratuit",
    or: "ou",
    demoLink: "Voir d'abord la démo — aucun mot de passe requis",
  },
  footer: {
    tagline: "Gratuit et open-source.",
  },
};

const TRANSLATIONS: Translations = { en, nl, fr };

/** Exported for tests and tooling (translation parity checks). */
export const LANDING_TRANSLATIONS = TRANSLATIONS;

export interface LandingLanguageContextValue {
  language: LandingLanguage;
  copy: LandingCopy;
  setLanguage: (language: LandingLanguage) => void;
}

export const LandingLanguageContext = createContext<LandingLanguageContextValue | undefined>(
  undefined
);

export function useLandingLanguage(): LandingLanguageContextValue {
  const context = useContext(LandingLanguageContext);
  if (!context) {
    throw new Error("useLandingLanguage must be used within LandingLanguageProvider");
  }
  return context;
}