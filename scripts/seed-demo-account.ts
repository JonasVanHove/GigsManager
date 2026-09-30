/**
 * GigsManager — Demo Account Seeder
 * =================================
 *
 * Creates a fully populated demo / test account for sales pitches, live demos
 * and feature testing:
 *
 *   E-mail : demo@gigsmanager.app
 *   Name   : Demo Band Manager
 *
 * What it generates (dynamic dates, always "fresh"):
 *   - User + UserSettings + NotificationPreference
 *   - 2 bands ("The Electric Echoes", "Acoustic Duo Velvet")
 *   - 5 band members (name, phone, e-mail, avatar, band links)
 *   - 6 gigs: 3 finished & fully paid (past), 2 upcoming (open payments),
 *     1 tentative option (unknown performance fee)
 *   - GigBandMember rows with realistic earned/paid splits
 *   - 10 songs + 9 tags + song_bands / song_tags links
 *   - 2 setlists with SetlistItems (titles, chords, tuning, notes), one of
 *     them linked to an upcoming gig
 *   - 2 investments (+ InvestmentContributor shares)
 *   - 3 unread + 1 read notification, 1 (disabled) webhook
 *
 * SAFETY GUARANTEES
 * -----------------
 * 1. Every write is scoped to the demo user id. The script never runs an
 *    update/delete without a `userId` filter, so existing data of other
 *    accounts (e.g. jonasvh39@gmail.com) is never touched or overwritten.
 * 2. If the demo account already exists the script stops (idempotent) unless
 *    `--reset` is passed: then ONLY the demo account is removed and rebuilt.
 * 3. `--dry-run` builds the complete data plan but writes nothing.
 *
 * Usage
 * -----
 *   npm run db:seed:demo        # create (aborts if account already exists)
 *   npm run db:seed:demo:reset  # delete + recreate the demo account only
 *   npm run db:seed:demo:dry    # print the plan, no database writes
 *   npx tsx scripts/seed-demo-account.ts --reset --skip-auth
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const DEMO_EMAIL = "demo@gigsmanager.app";
const DEMO_NAME = "Demo Band Manager";

/** Stable Supabase auth id placeholder; replaced by the real auth id when
 *  SUPABASE_SERVICE_ROLE_KEY is available. */
const DEMO_SUPABASE_ID = process.env.DEMO_SUPABASE_ID || "demo-gigsmanager-demo-account";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Demo1234!";

// ---------------------------------------------------------------------------
// ID & date helpers
// ---------------------------------------------------------------------------
let cuidCounter = Math.floor(Math.random() * 0xffff);

function nextCounter(): string {
  cuidCounter = (cuidCounter + 1) % 0xffff;
  return cuidCounter.toString(36).padStart(4, "0");
}

function randomBase36(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(Math.random() * 36).toString(36);
  }
  return out;
}

/** Cuid-compatible id (same shape as Prisma's `@default(cuid())`).
 *  Tables without a default (`bands`, `songs`, `tags`, `song_bands`,
 *  `song_tags`) get a `randomUUID()` instead — exactly like the app does. */
function newCuid(): string {
  return `c${Date.now().toString(36).padStart(8, "0")}${nextCounter()}${randomBase36(12)}`;
}

/** `days` days from `base`, pinned to a local wall-clock time. */
function createDate(base: Date, days: number, hour: number, minute = 0): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** YYYY-MM-DD in local time (the format `Setlist.datum` uses). */
function toDateOnly(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Equal split used by `calculateGigFinancials()` (manager included). */
const sharePerMusician = (performanceFee: number, numberOfMusicians: number) =>
  round2(performanceFee / Math.max(1, numberOfMusicians));

const money = (value: number) =>
  `€${value.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const longDate = (date: Date) =>
  date.toLocaleDateString("nl-BE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// ---------------------------------------------------------------------------
// Serializers — the exact formats the UI writes
// ---------------------------------------------------------------------------
const SONG_META_START = "[[song-meta]]";
const SONG_META_END = "[[/song-meta]]";

type SongMeta = {
  bandProject: string;
  genre: string;
  keySignature: string;
  bpm: string;
  comments: string;
};

/** Mirrors `serializeSongNotes()` in SongsTab.tsx / SetlistsTab.tsx. */
function serializeSongNotes(meta: SongMeta, body: string): string {
  const cleanBody = body.trim();
  return `${SONG_META_START}\n${JSON.stringify(meta)}\n${SONG_META_END}${cleanBody ? `\n\n${cleanBody}` : ""}`;
}

type SetlistMeta = {
  datum: string | null;
  locatie: string;
  notities: string;
  status: string;
  pauseOnTuningChange: boolean;
};

/** Mirrors `serializeSetlistMeta()` in SetlistsTab.tsx. */
const serializeSetlistMeta = (meta: SetlistMeta): string => JSON.stringify(meta);

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------
type BandPlan = { id: string; name: string; color: string; logoUrl: string | null };
type MemberPlan = {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  avatarUrl: string;
  bands: string[];
};
type SongPlan = { id: string; title: string; notes: string; date: Date; tagNames: string[]; bandIds: string[] };
type SetlistItemPlan = {
  id: string;
  order: number;
  type: "song" | "note";
  title: string;
  notes: string;
  chords: string;
  tuning: string;
};
type SetlistPlan = {
  id: string;
  title: string;
  description: string;
  status: string;
  datum: string | null;
  locatie: string;
  bandId: string | null;
  createdAt: Date;
  items: SetlistItemPlan[];
};
type GigMemberPlan = { memberId: string; earnedAmount: number; paidAmount: number };
type GigPlan = {
  id: string;
  eventName: string;
  date: Date;
  bookingDate: Date;
  performers: string;
  numberOfMusicians: number;
  performanceLineup: string;
  performanceFee: number;
  technicalFee: number;
  managerBonusType: "fixed" | "percentage";
  managerBonusAmount: number;
  performanceDistribution: "equal";
  claimPerformanceFee: boolean;
  claimTechnicalFee: boolean;
  technicalFeeClaimAmount: number | null;
  managerHandlesDistribution: boolean;
  managerPerforms: boolean;
  advanceReceivedByManager: number;
  advanceToMusicians: number;
  paymentReceived: boolean;
  paymentReceivedDate: Date | null;
  bandPaid: boolean;
  bandPaidDate: Date | null;
  isCharity: boolean;
  isTentative: boolean;
  performanceFeeUnknown: boolean;
  notes: string;
  bandId: string | null;
  setlistId: string | null;
  bandMembers: GigMemberPlan[];
};
type InvestmentPlan = {
  id: string;
  amount: number;
  description: string;
  date: Date;
  sharedWithMusician: boolean;
  contributorIds: string[];
};
type NotificationPlan = {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string;
  actionUrl: string | null;
  actionLabel: string | null;
  status: "unread" | "read";
  createdAt: Date;
  readAt: Date | null;
};

type DemoPlan = {
  user: { id: string; supabaseId: string; email: string; name: string };
  settings: {
    id: string;
    currency: string;
    claimPerformanceFee: boolean;
    claimTechnicalFee: boolean;
    theme: string;
    customTab1: string;
    customTab2: string;
    overviewViewMode: string;
    excludeSelfFromMemberCount: boolean;
  };
  notificationPreference: {
    id: string;
    emailNotifications: boolean;
    inAppNotifications: boolean;
    paymentReminders: boolean;
    overdueAlerts: boolean;
    upcomingGigReminders: boolean;
    dailyDigest: boolean;
  };
  bands: BandPlan[];
  members: MemberPlan[];
  tagNames: string[];
  songs: SongPlan[];
  setlists: SetlistPlan[];
  gigs: GigPlan[];
  investments: InvestmentPlan[];
  notifications: NotificationPlan[];
  webhook: {
    id: string;
    provider: string;
    url: string;
    events: string[];
    enabled: boolean;
    name: string;
    secret: string | null;
  };
};

// ---------------------------------------------------------------------------
// The demo data plan (pure function — no database access)
// ---------------------------------------------------------------------------
function buildDemoPlan(): DemoPlan {
  const today = new Date();

  const user = {
    id: newCuid(),
    supabaseId: DEMO_SUPABASE_ID,
    email: DEMO_EMAIL,
    name: DEMO_NAME,
  };

  const settings = {
    id: newCuid(),
    currency: "EUR",
    claimPerformanceFee: true,
    claimTechnicalFee: true,
    theme: "dark",
    customTab1: "setlists",
    customTab2: "songs",
    overviewViewMode: "grid",
    excludeSelfFromMemberCount: false,
  };

  const notificationPreference = {
    id: newCuid(),
    emailNotifications: true,
    inAppNotifications: true,
    paymentReminders: true,
    overdueAlerts: true,
    upcomingGigReminders: true,
    dailyDigest: false,
  };

  // --- Bands ---------------------------------------------------------------
  const echoes: BandPlan = {
    id: randomUUID(),
    name: "The Electric Echoes",
    color: "#6366f1",
    logoUrl: null,
  };
  const velvet: BandPlan = {
    id: randomUUID(),
    name: "Acoustic Duo Velvet",
    color: "#ec4899",
    logoUrl: null,
  };
  const bands = [echoes, velvet];

  // --- Band members --------------------------------------------------------
  // `bands` holds band NAMES (strings) — that is how BandsTab/GigForm match them.
  const avatarFor = (name: string) =>
    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
      name
    )}&backgroundColor=6366f1,ec4899,f59e0b,10b981,0ea5e9`;

  const makeMember = (
    name: string,
    role: string,
    email: string,
    phone: string,
    bandNames: string[],
    notes: string
  ): MemberPlan => ({
    id: newCuid(),
    name,
    email,
    phone,
    notes: `${role} — ${notes}`,
    avatarUrl: avatarFor(name),
    bands: bandNames,
  });

  const nora = makeMember(
    "Nora Vandeweghe",
    "Leadzang",
    "nora@electricechoes.be",
    "+32 475 82 14 09",
    [echoes.name, velvet.name],
    "Frontvrouw van beide projecten. Wil bij ceremonies altijd 2 weken vooraf de setlist, houdt van rustige sfeer."
  );
  const elias = makeMember(
    "Elias Janssens",
    "Gitaar & keys",
    "elias@electricechoes.be",
    "+32 471 09 63 22",
    [echoes.name, velvet.name],
    "Sluit ook aan bij akoestische sets. Eigen versterker, kan zonder di-buzz overweg."
  );
  const maya = makeMember(
    "Maya Okonkwo",
    "Bas",
    "maya@electricechoes.be",
    "+32 486 33 71 05",
    [echoes.name],
    "Vaste bassist sinds de oprichting. Facturen via eigen bedrijf, btw-plichtig."
  );
  const finn = makeMember(
    "Finn De Ridder",
    "Drums",
    "finn@electricechoes.be",
    "+32 472 55 18 40",
    [echoes.name],
    "Komt recht van de repetitie; neemt eigen kit mee. Nipt graag tijdens de opbouw."
  );
  const sofie = makeMember(
    "Sofie Lambert",
    "Session cello & viool",
    "sofie@velvetduo.be",
    "+32 479 27 65 31",
    [velvet.name],
    "Enkel sessiewerk voor Velvet en gelegenheidsoptredens. Reageert pas 5 dagen vooraf."
  );
  const members = [nora, elias, maya, finn, sofie];

  // --- Songs, tags & band links -------------------------------------------
  const tagNames = [
    "Pop",
    "Rock",
    "Acoustic",
    "Up-tempo",
    "Ballad",
    "Ceremonie",
    "Dansbaar",
    "Finale",
    "Instrumentaal",
  ];

  const makeSong = (
    title: string,
    artist: string,
    band: BandPlan,
    genre: string,
    keySignature: string,
    bpm: string,
    comments: string,
    songTags: string[],
    addedDaysAgo: number,
    structure: string
  ): SongPlan => ({
    id: randomUUID(),
    title,
    notes: serializeSongNotes(
      { bandProject: band.name, genre, keySignature, bpm, comments },
      `Artiest: ${artist}\n\n${structure.trim()}`
    ),
    date: createDate(today, -addedDaysAgo, 12),
    tagNames: songTags,
    bandIds: [band.id],
  });

  const songs: SongPlan[] = [
    makeSong(
      "Believer",
      "Imagine Dragons",
      echoes,
      "Pop/Rock",
      "Standaard (E)",
      "125",
      "Set-opener: 4 maten drumfill, daarna meteen het refrein in.",
      ["Up-tempo", "Rock", "Dansbaar"],
      75,
      `Structuur: Intro (4) – Verse – Pre – Chorus – Verse – Chorus – Bridge – Chorus – Outro
Ritme: 8ste noten in de verse, kwartnoten in het refrein
Dynamiek: bridge zakt weg, laatste chorus vol gas`
    ),
    makeSong(
      "Don't Stop Me Now",
      "Queen",
      echoes,
      "Pop/Rock",
      "Standaard (F)",
      "126",
      "Tweede nummer van de set; publiek zingt vanaf het eerste refrein mee.",
      ["Up-tempo", "Pop", "Dansbaar"],
      60,
      `Structuur: Intro – Verse – Pre – Chorus – Verse – Chorus – Solo – Chorus – Outro
Klein zingbaar refrein, handen omhoog vanaf de tweede regel
Solo: gitaar (Elias) speelt de oorspronkelijke pianistische figuur`
    ),
    makeSong(
      "Dancing in the Moonlight",
      "Toploader",
      echoes,
      "Pop/Rock",
      "Standaard (E)",
      "119",
      "Dansnummer om het volk op de been te krijgen na het rustige midden.",
      ["Pop", "Up-tempo", "Dansbaar"],
      96,
      `Structuur: Intro – Verse – Pre – Chorus (x2) – Verse – Chorus – Outro
Harmonieën: 3- en 4-stemmig, zang blijft boven de gitaar
Tip: oogcontact maken met het publiek in het laatste refrein`
    ),
    makeSong(
      "Mr. Brightside",
      "The Killers",
      echoes,
      "Indie Rock",
      "Capo II",
      "148",
      "Klassieker voor festivals; capo 2, snelle 8ste nootjes in de intro.",
      ["Rock", "Up-tempo", "Finale"],
      120,
      `Structuur: Intro (8) – Verse – Pre – Chorus – Verse – Chorus – Solo – Chorus – Outro
Capo: 2e fret, daardoor A-vorm akkoorden (E – G#m – C#m – A)
Solo: gitaar + keys, drums blijft in de pocket`
    ),
    makeSong(
      "Rolling in the Deep",
      "Adele",
      echoes,
      "Pop",
      "Standaard (Dm)",
      "80",
      "Laatste nummer van de set; confetti pas ná de slotnoot.",
      ["Pop", "Rock", "Finale"],
      140,
      `Structuur: Intro – Verse – Pre – Chorus – Verse – Chorus – Bridge – Chorus
Ritme: strakke kwartnoten, drums en gitaar spelen exact gelijk
Opbouw: laatste chorus een halve toon hoger gezongen als climax`
    ),
    makeSong(
      "Sweet Child o' Mine",
      "Guns N' Roses",
      echoes,
      "Rock",
      "Standaard (E)",
      "125",
      "Alleen spelen als er tijd over is (encore) of als laatste reguliere nummer.",
      ["Rock", "Instrumentaal"],
      150,
      `Structuur: Intro (distorted riff) – Verse – Pre – Chorus – Verse – Chorus – Solo – Chorus – Outro
Riff: 12-String gitaar (Elias), noten exact gelijk aan de originele ritmesectie
Let op: na de eerste solo de zang terug, daarna pas de slot-solo`
    ),
    // --- Acoustic Duo Velvet ------------------------------------------------
    makeSong(
      "Perfect",
      "Ed Sheeran",
      velvet,
      "Ballad",
      "Standaard (G)",
      "95",
      "Ceremonie-opener; zacht en ongeaccentueerd, microfoon dicht bij de mond.",
      ["Acoustic", "Ballad", "Ceremonie"],
      88,
      `Structuur: Intro – Verse – Pre – Chorus – Verse – Chorus – Bridge – Outro
Akkoordvoorkeur: G – D – Em – C (om en om, rustig tussen de coupletten)
Speelniveau: geen fill-ins, zodat de toespraken niet worden overstemd`
    ),
    makeSong(
      "Fields of Gold",
      "Sting",
      velvet,
      "Ballad",
      "Capo II",
      "128",
      "Tijdens de tafelronde; twee coupletten plus refrein is voldoende.",
      ["Acoustic", "Ballad", "Ceremonie"],
      70,
      `Structuur: Intro – Verse (x2) – Chorus – Verse – Chorus – Outro
Capo: 2e fret, akkoorden A – D – E – F#-vorm
Tip: tafelronde-vriendelijk tempo, niet doorspeelen tijdens de speeches`
    ),
    makeSong(
      "Yellow",
      "Coldplay",
      velvet,
      "Pop",
      "Standaard (G)",
      "107",
      "Eerste dansnummer; tempo iets hoger dan tijdens de ceremonie.",
      ["Acoustic", "Up-tempo", "Dansbaar"],
      100,
      `Structuur: Intro – Verse – Pre – Chorus – Verse – Chorus – Outro
Dansversie: eerste en laatste refrein met handclaps, publiek meeklappen
Nora zingt lead, Elias speelt de tegenmelodie op de tweede gitaar`
    ),
    makeSong(
      "Someone You Loved",
      "Lewis Capaldi",
      velvet,
      "Ballad",
      "Capo I",
      "75",
      "Laatste nummer van de avond; zachte landing, geen applaus-prompt.",
      ["Ballad", "Acoustic"],
      45,
      `Structuur: Intro – Verse – Pre – Chorus – Verse – Chorus – Bridge – Outro
Capo: 1e fret, akkoordlijst C – G – Am – F
Afbouw: laatste regel live uit laten lopen, daarna stilte`
    ),
  ];

  // --- Setlists ------------------------------------------------------------
  // Gig dates live in one place so the setlists and notifications match.
  const gigDates = {
    festival: createDate(today, -32, 20, 0),
    corporate: createDate(today, -18, 22, 0),
    wedding: createDate(today, -9, 16, 30),
    newYear: createDate(today, 14, 21, 0),
    weddingPeeters: createDate(today, 27, 14, 30),
    zandstock: createDate(today, 38, 19, 30),
  };

  const daysUntil = (target: Date) =>
    Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));

  const makeItem = (
    order: number,
    type: "song" | "note",
    title: string,
    chords: string,
    tuning: string,
    notes: string
  ): SetlistItemPlan => ({ id: newCuid(), order, type, title, chords, tuning, notes });

  const festivalSetlist: SetlistPlan = {
    id: newCuid(),
    title: "Festival Set — De Hele Nacht",
    description: serializeSetlistMeta({
      datum: toDateOnly(gigDates.newYear),
      locatie: "Marktplein, Gent",
      notities:
        "Twee sets van 45 min. Groot podium, eigen lichtset. Geen pyro of confetti zonder akkoord van de veiligheidsdienst.",
      status: "klaar",
      pauseOnTuningChange: true,
    }),
    status: "klaar",
    datum: toDateOnly(gigDates.newYear),
    locatie: "Marktplein, Gent",
    bandId: echoes.id,
    createdAt: createDate(today, -12, 21, 0),
    items: [
      makeItem(
        1,
        "song",
        "Believer",
        "Am – C – G – F",
        "Standaard (E)",
        "Opener: 4 maten drumfill, daarna direct het refrein."
      ),
      makeItem(
        2,
        "song",
        "Don't Stop Me Now",
        "F – G – Em – Am – Dm – G",
        "Standaard (F)",
        "Tweede nummer; publiek zingt vanaf de eerste regel mee."
      ),
      makeItem(
        3,
        "note",
        "Tussenstuk — 2 nummers akoestisch (Nora + Elias)",
        "—",
        "—",
        "Gitaren af, versterkers uit, 2 microfoons. Duur: 8 minuten."
      ),
      makeItem(
        4,
        "song",
        "Mr. Brightside",
        "E – G#m – C#m – A",
        "Capo II",
        "Capo op 2e fret; geen solo tussen de twee refreinen."
      ),
      makeItem(
        5,
        "song",
        "Rolling in the Deep",
        "Dm – Am – F – C",
        "Standaard (Dm)",
        "Tweede zangstem (Elias) vanaf het pre-chorus."
      ),
      makeItem(
        6,
        "note",
        "Wissel podium + water voor de band",
        "—",
        "—",
        "Productie regelt de oversteek; gitaars in de koffers."
      ),
      makeItem(
        7,
        "song",
        "Sweet Child o' Mine",
        "Intro: Am – F – C – G → E – D – A – E",
        "Standaard (E)",
        "Alleen spelen als de booker extra tijd geeft, anders overslaan."
      ),
      makeItem(
        8,
        "note",
        "Encore-check met de booker (5 min over?)",
        "—",
        "—",
        "Vraag het op de dag zelf; 'Sweet Child o' Mine' is het encorenummer."
      ),
    ],
  };

  const ceremonySetlist: SetlistPlan = {
    id: newCuid(),
    title: "Ceremonie Set — Bruiloft Peeters",
    description: serializeSetlistMeta({
      datum: toDateOnly(gigDates.weddingPeeters),
      locatie: "Kasteel d'Urbex, Brugge",
      notities:
        "Ceremonie 15:00, dansavond 20:00. Twee blokken: rustig tijdens de toespraken, vanaf 20:00 op volle gas.",
      status: "concept",
      pauseOnTuningChange: false,
    }),
    status: "concept",
    datum: toDateOnly(gigDates.weddingPeeters),
    locatie: "Kasteel d'Urbex, Brugge",
    bandId: velvet.id,
    createdAt: createDate(today, -30, 19, 30),
    items: [
      makeItem(
        1,
        "song",
        "Perfect",
        "G – D – Em – C",
        "Standaard (G)",
        "Ceremonie-opener; zacht en ongeaccentueerd."
      ),
      makeItem(
        2,
        "song",
        "Fields of Gold",
        "A – D – E – F#",
        "Capo II",
        "Tafelronde; twee coupletten plus refrein is voldoende."
      ),
      makeItem(
        3,
        "note",
        "Pauze — 20 minuten (borrel & foto's)",
        "—",
        "—",
        "Geluid uit; tafelschikken. Informeel akkoord met het paar."
      ),
      makeItem(
        4,
        "song",
        "Yellow",
        "G – D – Em – C",
        "Standaard (G)",
        "Eerste dansnummer; handclaps vanaf het refrein."
      ),
      makeItem(
        5,
        "song",
        "Someone You Loved",
        "C – G – Am – F",
        "Capo I",
        "Laatste nummer van de avond; zachte landing, geen applaus-prompt."
      ),
    ],
  };

  const setlists = [festivalSetlist, ceremonySetlist];

  // --- Gigs ----------------------------------------------------------------
  // Defaults that match the app's own "new gig" form values.
  const gigBase = {
    claimPerformanceFee: true,
    claimTechnicalFee: true,
    technicalFeeClaimAmount: null,
    managerHandlesDistribution: true,
    managerPerforms: true,
    performanceDistribution: "equal" as const,
    advanceToMusicians: 0,
    isCharity: false,
    isTentative: false,
    performanceFeeUnknown: false,
    bandId: null as string | null,
    setlistId: null as string | null,
    bandMembers: [] as GigMemberPlan[],
  };

  /** earnedAmount always matches `calculateGigFinancials().amountPerMusician`. */
  const splitGig = (
    gigMembers: MemberPlan[],
    performanceFee: number,
    numberOfMusicians: number,
    fullyPaid: boolean
  ): GigMemberPlan[] => {
    const earned = sharePerMusician(performanceFee, numberOfMusicians);
    return gigMembers.map((member) => ({
      memberId: member.id,
      earnedAmount: earned,
      paidAmount: fullyPaid ? earned : 0,
    }));
  };

  const echoesLineup =
    "Nora Vandeweghe (zang), Elias Janssens (gitaar), Maya Okonkwo (bas), Finn De Ridder (drums), Demo Band Manager (productie)";

  const gigs: GigPlan[] = [
    // 1 ── Afgelopen: betaald, band betaald -----------------------------------
    {
      ...gigBase,
      id: newCuid(),
      eventName: "Zomerfestival Rivierland",
      date: gigDates.festival,
      bookingDate: createDate(today, -96, 10, 30),
      performers: echoes.name,
      numberOfMusicians: 5,
      performanceLineup: echoesLineup,
      performanceFee: 2500,
      technicalFee: 400,
      managerBonusType: "percentage",
      managerBonusAmount: 10,
      advanceReceivedByManager: 500,
      paymentReceived: true,
      paymentReceivedDate: createDate(today, -27, 12, 0),
      bandPaid: true,
      bandPaidDate: createDate(today, -25, 18, 0),
      notes: `Hoofdpodium, 21:30 – 22:45. Eigen PA aanwezig; monitor + 4 microfoons gevraagd.
Totaal voor de manager: €2.500 performance fee + €400 technische fee + 10% bonus = €3.150.
Voorschot van €500 op de avond zelf, saldo 5 dagen later gestort.
Gages: €500 per muzikant (5 muzikanten, gelijke verdeling), in één overschrijving aan Nora, Elias, Maya en Finn.
Nieuwe lichtset was een upgrade t.o.v. vorig jaar — deze booker willen we zeker terug zien in de zomer.
Contact op de dag zelf: Koen (sound engineer), bereikbaar via de productie.`,
      bandId: echoes.id,
      bandMembers: splitGig([nora, elias, maya, finn], 2500, 5, true),
    },
    // 2 ── Afgelopen: betaald, band betaald -----------------------------------
    {
      ...gigBase,
      id: newCuid(),
      eventName: "Bedrijfsfeest Vandermeulen",
      date: gigDates.corporate,
      bookingDate: createDate(today, -58, 9, 15),
      performers: echoes.name,
      numberOfMusicians: 5,
      performanceLineup: echoesLineup,
      performanceFee: 3200,
      technicalFee: 500,
      managerBonusType: "fixed",
      managerBonusAmount: 250,
      advanceReceivedByManager: 1000,
      paymentReceived: true,
      paymentReceivedDate: createDate(today, -14, 10, 0),
      bandPaid: true,
      bandPaidDate: createDate(today, -12, 20, 0),
      notes: `Privé-diner voor 120 gasten in hun loods, aansluitend dansavond tot 01:00.
Totaal voor de manager: €3.200 performance fee + €500 technische fee + €250 vaste bonus = €3.950.
Voorschot van €1.000 bij het opzetten van het evenement, saldo 4 dagen na het feest gestort.
Gages: €640 per muzikant (5 muzikanten), alle vier betaald.
Vaste klant: vraag voor offerte op maat, zij tippen het bedrijf overal intern door.`,
      bandId: echoes.id,
      bandMembers: splitGig([nora, elias, maya, finn], 3200, 5, true),
    },
    // 3 ── Afgelopen: betaald, band betaald -----------------------------------
    {
      ...gigBase,
      id: newCuid(),
      eventName: "Trouwenis Van Gompel",
      date: gigDates.wedding,
      bookingDate: createDate(today, -120, 20, 0),
      performers: velvet.name,
      numberOfMusicians: 3,
      performanceLineup:
        "Nora Vandeweghe (zang), Elias Janssens (gitaar), Demo Band Manager (productie)",
      performanceFee: 1350,
      technicalFee: 0,
      managerBonusType: "fixed",
      managerBonusAmount: 150,
      advanceReceivedByManager: 300,
      paymentReceived: true,
      paymentReceivedDate: createDate(today, -7, 9, 0),
      bandPaid: true,
      bandPaidDate: createDate(today, -5, 19, 0),
      notes: `Ceremonie 16:30, daarna koffietafel en dansavond. Duo speelde volledig akoestisch met de PA van het hotel.
Totaal voor de manager: €1.350 performance fee + €150 vaste bonus = €1.500.
Gages: €450 per muzikant voor Nora en Elias, afgehandeld met Bancontact op de avond zelf.
Wensen van het paar: 'Perfect' tijdens de ceremonie en 'Yellow' als eerste dans — blijft onze aanbeveling.`,
      bandId: velvet.id,
      bandMembers: splitGig([nora, elias], 1350, 3, true),
    },
    // 4 ── Aankomend: betalingen nog open -------------------------------------
    {
      ...gigBase,
      id: newCuid(),
      eventName: "Nieuwejaarsbrug — Marktplein Gent",
      date: gigDates.newYear,
      bookingDate: createDate(today, -45, 14, 0),
      performers: echoes.name,
      numberOfMusicians: 5,
      performanceLineup: echoesLineup,
      performanceFee: 2400,
      technicalFee: 300,
      managerBonusType: "percentage",
      managerBonusAmount: 10,
      advanceReceivedByManager: 0,
      paymentReceived: false,
      paymentReceivedDate: null,
      bandPaid: false,
      bandPaidDate: null,
      notes: `Twee sets van 45 min op het grote marktplein, geluid en licht van de organisatie.
Totaal voor de manager zodra betaald: €2.400 + €300 technisch + 10% bonus = €2.940.
Factuur is verstuurd, betaling verwacht binnen 14 dagen na het optreden (betalingstermijn 30 dagen in het contract).
Gages voor de vier muzikanten: €480 p.p., uitbetaling zodra de betaling binnen is.
Soundcheck 17:30 — setlist 'Festival Set — De Hele Nacht' is gekoppeld en klaar.`,
      bandId: echoes.id,
      setlistId: festivalSetlist.id,
      bandMembers: splitGig([nora, elias, maya, finn], 2400, 5, false),
    },
    // 5 ── Aankomend: betalingen nog open -------------------------------------
    {
      ...gigBase,
      id: newCuid(),
      eventName: "Bruiloft Peeters — Kasteel d'Urbex",
      date: gigDates.weddingPeeters,
      bookingDate: createDate(today, -70, 21, 30),
      performers: velvet.name,
      numberOfMusicians: 3,
      performanceLineup:
        "Nora Vandeweghe (zang), Elias Janssens (gitaar), Demo Band Manager (productie)",
      performanceFee: 1450,
      technicalFee: 0,
      managerBonusType: "fixed",
      managerBonusAmount: 175,
      advanceReceivedByManager: 0,
      paymentReceived: false,
      paymentReceivedDate: null,
      bandPaid: false,
      bandPaidDate: null,
      notes: `Ceremonie 15:00, koffietafel 16:00, dansavond vanaf 20:00. We gebruiken de eigen PA van het kasteel.
Totaal voor de manager: €1.450 + €175 vaste bonus = €1.625, plus kilometervergoeding (Los <- 3u).
Aanvraag voor derde cello (Sofie) is nog niet beslist — pas toevoegen na akkoord van het paar.
Setlist 'Ceremonie Set — Bruiloft Peeters' staat als concept klaar.`,
      bandId: velvet.id,
      setlistId: ceremonySetlist.id,
      bandMembers: splitGig([nora, elias], 1450, 3, false),
    },
    // 6 ── Optie: voorlopig, bedrag onbekend -----------------------------------
    {
      ...gigBase,
      id: newCuid(),
      eventName: "Zandstock Festival — optie",
      date: gigDates.zandstock,
      bookingDate: createDate(today, -20, 11, 0),
      performers: echoes.name,
      numberOfMusicians: 5,
      performanceLineup:
        "Nora Vandeweghe (zang), Elias Janssens (gitaar), Maya Okonkwo (bas), Finn De Ridder (drums), Demo Band Manager (productie)",
      performanceFee: 0,
      technicalFee: 0,
      managerBonusType: "percentage",
      managerBonusAmount: 10,
      advanceReceivedByManager: 0,
      isTentative: true,
      performanceFeeUnknown: true,
      paymentReceived: false,
      paymentReceivedDate: null,
      bandPaid: false,
      bandPaidDate: null,
      notes: `Voorlopige optie: de organisatie beslist over de lineup zodra de festivalprogramma's bekend zijn.
Definitieve bevestiging verwacht uiterlijk 3 weken voor het festival; daarna pas een setlist vastleggen.
'Performance fee onbekend' staat aan tot de prijsafspraak rond is, dus de gage-verdeling is nog niet ingevuld.
Gewenste plek in het programma: tussen twee pop acts, avondslot (21:00 – 22:15).
Zodra het bedrag bekend is: performance fee invullen, isTentative uitzetten en gages aan de vier muzikanten toevoegen.`,
      bandId: echoes.id,
      bandMembers: [],
    },
  ];

  // --- Investments ----------------------------------------------------------
  const investments: InvestmentPlan[] = [
    {
      id: newCuid(),
      amount: 1480,
      description: "In-Ear Monitor Systeem (4 kanalen) — Shure PSM1000 voor Nora & Finn",
      date: createDate(today, -52, 15, 0),
      sharedWithMusician: true,
      contributorIds: [nora.id, finn.id],
    },
    {
      id: newCuid(),
      amount: 675,
      description: "Onderhoud PA-installatie & nieuwe delay-toren (eigen rekening)",
      date: createDate(today, -16, 11, 30),
      sharedWithMusician: false,
      contributorIds: [],
    },
  ];

  // --- Notifications --------------------------------------------------------
  const newYearGig = gigs[3];
  const notifications: NotificationPlan[] = [
    {
      id: newCuid(),
      type: "payment_overdue",
      title: "Betaling staat nog open",
      message: `Voor '${newYearGig.eventName}' is €2.940,00 (fee + technische fee + bonus) nog niet ontvangen. Factuur is 5 dagen geleden verstuurd.`,
      icon: "⏰",
      actionUrl: "/?tab=gigs",
      actionLabel: "Bekijk optreden",
      status: "unread",
      createdAt: createDate(today, -2, 9, 12),
      readAt: null,
    },
    {
      id: newCuid(),
      type: "upcoming_gig",
      title: `Optreden over ${daysUntil(gigDates.newYear)} dagen`,
      message: `'${newYearGig.eventName}' met ${newYearGig.performers}. Soundcheck 17:30; setlist 'Festival Set — De Hele Nacht' staat klaar.`,
      icon: "🎵",
      actionUrl: `/?tab=setlists&setlist=${festivalSetlist.id}`,
      actionLabel: "Open setlist",
      status: "unread",
      createdAt: createDate(today, -1, 18, 5),
      readAt: null,
    },
    {
      id: newCuid(),
      type: "gig_added",
      title: "Nieuwe optie: Zandstock Festival",
      message: `Optie geplaatst over ${longDate(gigs[5].date)}. Het bedrag is nog onbekend, dus de gage-verdeling blijft leeg tot de boeking rond is.`,
      icon: "📌",
      actionUrl: "/?tab=gigs",
      actionLabel: "Bekijk optie",
      status: "unread",
      createdAt: createDate(today, 0, 8, 40),
      readAt: null,
    },
    {
      id: newCuid(),
      type: "payment_received",
      title: "Betaling ontvangen",
      message: "€1.500,00 ontvangen voor 'Trouwenis Van Gompel' — beide muzikanten zijn betaald.",
      icon: "💰",
      actionUrl: "/?tab=gigs",
      actionLabel: "Bekijk optreden",
      status: "read",
      createdAt: createDate(today, -7, 9, 30),
      readAt: createDate(today, -6, 8, 15),
    },
  ];

  // --- Webhook (disabled on purpose: no calls during demos) -----------------
  const webhook = {
    id: newCuid(),
    provider: "webhook",
    url: "https://example.com/webhooks/gigsmanager-demo",
    events: ["gig.created", "gig.updated", "payment.received"],
    enabled: false,
    name: "Demo integratie (uitgeschakeld)",
    secret: null,
  };

  return {
    user,
    settings,
    notificationPreference,
    bands,
    members,
    tagNames,
    songs,
    setlists,
    gigs,
    investments,
    notifications,
    webhook,
  };
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------
function printPlanSummary(plan: DemoPlan): void {
  console.log(`\n📋 Demo-account dataplantje voor ${plan.user.email}\n`);

  console.log(`   Bands        : ${plan.bands.map((b) => b.name).join(", ")}`);
  console.log(`   Band members : ${plan.members.length}`);
  for (const member of plan.members) {
    console.log(`      • ${member.name.padEnd(20)} ${member.phone.padEnd(18)} ${member.bands.join(" + ")}`);
  }

  console.log(`\n   Gigs (${plan.gigs.length}):`);
  for (const gig of plan.gigs) {
    const bonus =
      gig.managerBonusType === "percentage"
        ? `${gig.managerBonusAmount}%`
        : money(gig.managerBonusAmount);
    const gross =
      gig.performanceFeeUnknown
        ? "bedrag onbekend"
        : money(gig.performanceFee + gig.technicalFee);
    const clientPaid = gig.paymentReceived ? "betaald" : "open";
    const bandPaid = gig.bandPaid ? "band betaald" : "band open";
    console.log(
      `      • ${longDate(gig.date).padEnd(26)} ${gig.eventName.padEnd(34)} ` +
        `${gig.performers.padEnd(22)} ${gross.padEnd(20)} bonus ${bonus.padEnd(11)} ` +
        `boeker ${clientPaid} / ${bandPaid}` +
        (gig.isTentative ? "  [optie]" : "")
    );
  }

  console.log(`\n   Setlists (${plan.setlists.length}):`);
  for (const setlist of plan.setlists) {
    console.log(
      `      • ${setlist.title.padEnd(38)} ${setlist.status.padEnd(8)} ${setlist.items.length} items, ${setlist.locatie}`
    );
  }

  console.log(`\n   Songs       : ${plan.songs.length} (tags: ${plan.tagNames.join(", ")})`);
  console.log(
    `   Investments : ${plan.investments.map((i) => `${i.description} (${money(i.amount)})`).join(" | ")}`
  );
  console.log(
    `   Meldingen   : ${plan.notifications.filter((n) => n.status === "unread").length} ongelezen, ` +
      `${plan.notifications.length - plan.notifications.filter((n) => n.status === "unread").length} gelezen`
  );
  console.log(`   Webhook     : ${plan.webhook.name} (enabled=${plan.webhook.enabled})\n`);
}

// ---------------------------------------------------------------------------
// Database layer
// ---------------------------------------------------------------------------
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL ontbreekt. Zet DATABASE_URL in je .env (of in de omgeving) voordat je dit script draait."
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["warn", "error"],
  });
}

/**
 * Removes ONLY the demo account and everything that belongs to it.
 *
 * Every statement is filtered on the demo user id, so data of other accounts
 * (e.g. jonasvh39@gmail.com) is never deleted. Child rows are removed
 * explicitly instead of relying on ON DELETE CASCADE, so the reset also works
 * on a database where the FK cascades are missing.
 */
async function removeDemoAccount(prisma: PrismaClient, userId: string): Promise<void> {
  // songs (+ link tables without a foreign key)
  const songs = await prisma.songs.findMany({ where: { userId }, select: { id: true } });
  const songIds = songs.map((song) => song.id);
  if (songIds.length > 0) {
    await prisma.song_bands.deleteMany({ where: { songId: { in: songIds } } });
    await prisma.song_tags.deleteMany({ where: { songId: { in: songIds } } });
    await prisma.song_attachments.deleteMany({ where: { songId: { in: songIds } } });
    await prisma.songs.deleteMany({ where: { id: { in: songIds } } });
  }

  const tags = await prisma.tags.findMany({ where: { userId }, select: { id: true } });
  if (tags.length > 0) {
    await prisma.tags.deleteMany({ where: { id: { in: tags.map((tag) => tag.id) } } });
  }

  // gigs (before setlists, because Gig.setlistId points at Setlist)
  const gigs = await prisma.gig.findMany({ where: { userId }, select: { id: true } });
  const gigIds = gigs.map((gig) => gig.id);
  if (gigIds.length > 0) {
    await prisma.gigBandMember.deleteMany({ where: { gigId: { in: gigIds } } });
    await prisma.gig.deleteMany({ where: { id: { in: gigIds } } });
  }

  // setlists + items
  const setlists = await prisma.setlist.findMany({
    where: { userId },
    select: { id: true, items: { select: { id: true } } },
  });
  const setlistItemIds = setlists.flatMap((setlist) => setlist.items.map((item) => item.id));
  if (setlistItemIds.length > 0) {
    await prisma.setlistItemAttachment.deleteMany({ where: { setlistItemId: { in: setlistItemIds } } });
    await prisma.setlistItem.deleteMany({ where: { id: { in: setlistItemIds } } });
  }
  const setlistIds = setlists.map((setlist) => setlist.id);
  if (setlistIds.length > 0) {
    await prisma.setlist.deleteMany({ where: { id: { in: setlistIds } } });
  }

  // investments
  const investments = await prisma.investment.findMany({ where: { userId }, select: { id: true } });
  const investmentIds = investments.map((investment) => investment.id);
  if (investmentIds.length > 0) {
    await prisma.investmentContributor.deleteMany({ where: { investmentId: { in: investmentIds } } });
    await prisma.investment.deleteMany({ where: { id: { in: investmentIds } } });
  }

  // webhooks
  const webhooks = await prisma.webhook.findMany({ where: { userId }, select: { id: true } });
  const webhookIds = webhooks.map((webhook) => webhook.id);
  if (webhookIds.length > 0) {
    await prisma.webhookLog.deleteMany({ where: { webhookId: { in: webhookIds } } });
    await prisma.webhook.deleteMany({ where: { id: { in: webhookIds } } });
  }

  // share links
  const shareLinks = await prisma.shareLink.findMany({ where: { userId }, select: { id: true } });
  const shareLinkIds = shareLinks.map((link) => link.id);
  if (shareLinkIds.length > 0) {
    await prisma.shareLinkGig.deleteMany({ where: { shareLinkId: { in: shareLinkIds } } });
    await prisma.shareLink.deleteMany({ where: { id: { in: shareLinkIds } } });
  }

  await prisma.bandMember.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.notificationPreference.deleteMany({ where: { userId } });
  await prisma.userSettings.deleteMany({ where: { userId } });
  await prisma.photoNote.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });

  // `bands` has no FK to User, so it is cleaned up last.
  const bands = await prisma.bands.findMany({ where: { userId }, select: { id: true } });
  if (bands.length > 0) {
    await prisma.bands.deleteMany({ where: { id: { in: bands.map((band) => band.id) } } });
  }
}

/** Writes the complete plan. Every row is linked to the demo user id. */
async function seedPlan(prisma: PrismaClient, plan: DemoPlan): Promise<void> {
  const { user } = plan;

  await prisma.user.create({
    data: {
      id: user.id,
      supabaseId: user.supabaseId,
      email: user.email,
      name: user.name,
      superAdmin: false,
    },
  });

  await prisma.userSettings.create({ data: { ...plan.settings, userId: user.id } });
  await prisma.notificationPreference.create({
    data: { ...plan.notificationPreference, userId: user.id },
  });

  for (const band of plan.bands) {
    await prisma.bands.create({
      data: {
        id: band.id,
        name: band.name,
        color: band.color,
        logoUrl: band.logoUrl,
        userId: user.id,
      },
    });
  }

  for (const member of plan.members) {
    await prisma.bandMember.create({
      data: {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        notes: member.notes,
        avatarUrl: member.avatarUrl,
        bands: member.bands,
        userId: user.id,
      },
    });
  }

  // One tag row per unique name, so the tag filters never show duplicates.
  const tagIds = new Map<string, string>();
  for (const name of plan.tagNames) {
    const id = randomUUID();
    tagIds.set(name, id);
    await prisma.tags.create({ data: { id, name, userId: user.id } });
  }

  for (const song of plan.songs) {
    await prisma.songs.create({
      data: {
        id: song.id,
        title: song.title,
        notes: song.notes,
        date: song.date,
        createdAt: song.date,
        userId: user.id,
      },
    });
    for (const bandId of song.bandIds) {
      await prisma.song_bands.create({ data: { id: randomUUID(), songId: song.id, bandId } });
    }
    for (const tagName of song.tagNames) {
      const tagId = tagIds.get(tagName);
      if (!tagId) throw new Error(`Onbekende tag in het plan: ${tagName}`);
      await prisma.song_tags.create({ data: { id: randomUUID(), songId: song.id, tagId } });
    }
  }

  for (const setlist of plan.setlists) {
    await prisma.setlist.create({
      data: {
        id: setlist.id,
        title: setlist.title,
        description: setlist.description,
        status: setlist.status,
        datum: setlist.datum,
        locatie: setlist.locatie,
        bandId: setlist.bandId,
        createdAt: setlist.createdAt,
        userId: user.id,
      },
    });
    for (const item of setlist.items) {
      await prisma.setlistItem.create({
        data: {
          id: item.id,
          setlistId: setlist.id,
          order: item.order,
          type: item.type,
          title: item.title,
          notes: item.notes,
          chords: item.chords,
          tuning: item.tuning,
        },
      });
    }
  }

  for (const gig of plan.gigs) {
    const { bandMembers, ...gigFields } = gig;
    // The gig was entered on the day it was booked.
    await prisma.gig.create({ data: { ...gigFields, createdAt: gig.bookingDate, userId: user.id } });
    for (const gigMember of bandMembers) {
      await prisma.gigBandMember.create({
        data: {
          id: newCuid(),
          gigId: gig.id,
          bandMemberId: gigMember.memberId,
          earnedAmount: gigMember.earnedAmount,
          paidAmount: gigMember.paidAmount,
        },
      });
    }
  }

  for (const investment of plan.investments) {
    await prisma.investment.create({
      data: {
        id: investment.id,
        amount: investment.amount,
        description: investment.description,
        date: investment.date,
        createdAt: investment.date,
        sharedWithMusician: investment.sharedWithMusician,
        userId: user.id,
      },
    });
    for (const contributorId of investment.contributorIds) {
      await prisma.investmentContributor.create({
        data: { id: newCuid(), investmentId: investment.id, bandMemberId: contributorId },
      });
    }
  }

  for (const notification of plan.notifications) {
    await prisma.notification.create({
      data: {
        id: notification.id,
        userId: user.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        icon: notification.icon,
        actionUrl: notification.actionUrl,
        actionLabel: notification.actionLabel,
        status: notification.status,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
      },
    });
  }

  await prisma.webhook.create({
    data: {
      id: plan.webhook.id,
      userId: user.id,
      provider: plan.webhook.provider,
      url: plan.webhook.url,
      events: plan.webhook.events,
      enabled: plan.webhook.enabled,
      name: plan.webhook.name,
      secret: plan.webhook.secret,
    },
  });
}

// ---------------------------------------------------------------------------
// Supabase auth (optional)
// ---------------------------------------------------------------------------
/**
 * Creates the matching Supabase auth user (or resets its password) so the demo
 * account can actually be logged into. Needs NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY. The real Supabase id is written back to
 * `User.supabaseId`, because that is the id the app looks users up by.
 */
async function ensureSupabaseAuthUser(prisma: PrismaClient, plan: DemoPlan): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn("      ⚠️  Geen SUPABASE_SERVICE_ROLE_KEY gevonden — auth-account niet aangemaakt.");
    console.warn("         Maak 'demo@gigsmanager.app' dan handmatig aan in Supabase → Authentication → Users.");
    return false;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const perPage = 200;
  let existingId: string | null = null;
  for (let page = 1; page <= 10 && !existingId; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Supabase listUsers mislukt: ${error.message}`);
    const match = data.users.find(
      (candidate) => (candidate.email ?? "").toLowerCase() === plan.user.email.toLowerCase()
    );
    if (match) existingId = match.id;
    if (data.users.length < perPage) break;
  }

  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: plan.user.name },
    });
    if (error) throw new Error(`Supabase updateUser mislukt: ${error.message}`);
    await prisma.user.update({ where: { id: plan.user.id }, data: { supabaseId: existingId } });
    return true;
  }

  const { data: created, error } = await supabase.auth.admin.createUser({
    email: plan.user.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: plan.user.name },
  });
  if (error || !created.user) {
    throw new Error(`Supabase createUser mislukt: ${error?.message ?? "onbekende fout"}`);
  }
  await prisma.user.update({ where: { id: plan.user.id }, data: { supabaseId: created.user.id } });
  return true;
}

/** Reads everything back, so the summary reflects the database and not the plan. */
async function verifyPlan(prisma: PrismaClient, userId: string): Promise<void> {
  const [user, settings, bands, members, gigs, setlists, songs, tags, investments, notifications, webhooks] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }),
      prisma.userSettings.findUnique({ where: { userId }, select: { currency: true, theme: true, overviewViewMode: true } }),
      prisma.bands.count({ where: { userId } }),
      prisma.bandMember.count({ where: { userId } }),
      prisma.gig.count({ where: { userId } }),
      prisma.setlist.findMany({ where: { userId }, select: { title: true, _count: { select: { items: true } } } }),
      prisma.songs.count({ where: { userId } }),
      prisma.tags.count({ where: { userId } }),
      prisma.investment.count({ where: { userId } }),
      prisma.notification.count({ where: { userId } }),
      prisma.webhook.count({ where: { userId } }),
    ]);

  const unread = await prisma.notification.count({ where: { userId, status: "unread" } });
  const gages = await prisma.gigBandMember.count({ where: { gig: { userId } } });

  console.log("\n   ✅ Controle in de database:");
  console.log(`      User            : ${user?.email} (${user?.name})`);
  console.log(
    `      Settings        : ${settings?.currency}, thema ${settings?.theme}, overzicht ${settings?.overviewViewMode}`
  );
  console.log(`      Bands           : ${bands}`);
  console.log(`      Band members    : ${members}`);
  console.log(`      Gigs            : ${gigs} (${gages} gage-regels)`);
  for (const setlist of setlists) {
    console.log(`      Setlist         : ${setlist.title} (${setlist._count.items} items)`);
  }
  console.log(`      Songs           : ${songs} (${tags} tags)`);
  console.log(`      Investments     : ${investments}`);
  console.log(`      Meldingen       : ${notifications} (${unread} ongelezen)`);
  console.log(`      Webhooks        : ${webhooks}`);
  console.log(`\n   🔑 Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));
  const dryRun = flags.has("--dry-run") || flags.has("--dry");
  const reset = flags.has("--reset");
  const skipAuth = flags.has("--skip-auth");

  console.log("🎪 GigsManager — demo account seeder\n");

  const plan = buildDemoPlan();
  printPlanSummary(plan);

  if (dryRun) {
    console.log("   🧪 Dry-run: er is NIETS naar de database geschreven.\n");
    return;
  }

  const prisma = createPrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    const supabaseIdOwner = await prisma.user.findUnique({
      where: { supabaseId: plan.user.supabaseId },
      select: { id: true, email: true },
    });

    // Guard: never reuse a supabaseId that belongs to somebody else.
    if (supabaseIdOwner && supabaseIdOwner.email !== DEMO_EMAIL) {
      throw new Error(
        `De supabaseId '${plan.user.supabaseId}' is al in gebruik door ${supabaseIdOwner.email}. ` +
          "Zet DEMO_SUPABASE_ID op een unieke waarde, of laat --skip-auth staan en handmatig inloggen."
      );
    }

    if (existing && !reset) {
      console.log(`   ℹ️  Het demo-account bestaat al (${existing.email}). Er is niets gewijzigd.`);
      console.log("      Gebruik --reset om ALLEEN dit account opnieuw op te bouwen.\n");
      return;
    }

    if (existing) {
      console.log(`   🧹 Bestaand demo-account verwijderen (${existing.id}) …`);
      await removeDemoAccount(prisma, existing.id);
      console.log("      Verwijderd — andere accounts zijn niet aangeraakt.");
    }

    console.log("   🌱 Demo-account aanmaken …");
    await seedPlan(prisma, plan);
    console.log("      Aangemaakt.");

    if (!skipAuth) {
      console.log("   🔐 Supabase auth-account controleren …");
      try {
        const authOk = await ensureSupabaseAuthUser(prisma, plan);
        if (authOk) console.log(`      Klaar — login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
      } catch (error) {
        console.warn(
          "      ⚠️  Auth-account mislukt:",
          error instanceof Error ? error.message : String(error)
        );
        console.warn("         De database-data staat er wel; maak de login handmatig aan in Supabase.");
      }
    }

    await verifyPlan(prisma, plan.user.id);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\n❚ Seeden mislukt:", error);
  process.exitCode = 1;
});





