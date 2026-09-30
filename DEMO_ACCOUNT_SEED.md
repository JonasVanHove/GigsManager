# Demo-account seeder (`demo@gigsmanager.app`)

Volledig gevuld demo-/testaccount voor sales pitches, live demo's en feature-testing.
Het script staat in [`scripts/seed-demo-account.ts`](scripts/seed-demo-account.ts) en is
**losgekoppeld van `prisma/seed.ts`** — `npm run db:seed` (en `prisma migrate reset`)
doet dus nog exact wat het deed.

| | |
|---|---|
| E-mail | `demo@gigsmanager.app` |
| Naam | `Demo Band Manager` |
| Wachtwoord | `Demo1234!` (overschrijfbaar met `DEMO_PASSWORD`) |
| Currency / thema / overzicht | `EUR` · `dark` · `grid` |

---

## 1. Gebruik

```bash
# 0. Eerst kijken wat er zou gebeuren (schrijft NIETS naar de database)
npm run db:seed:demo:dry

# 1. Demo-account aanmaken (stopt als het al bestaat)
npm run db:seed:demo

# 2. Demo-account opnieuw opbouwen met verse, dynamische datums
npm run db:seed:demo:reset

# Extra vlaggen
npx tsx scripts/seed-demo-account.ts --reset --skip-auth   # geen Supabase-login aanmaken
```

Na een succesvolle run:

```
   ✅ Controle in de database:
      User            : demo@gigsmanager.app (Demo Band Manager)
      Settings        : EUR, thema dark, overzicht grid
      Bands           : 2
      Band members    : 5
      Gigs            : 6 (16 gage-regels)
      Setlist         : Festival Set — De Hele Nacht (8 items)
      Setlist         : Ceremonie Set — Bruiloft Peeters (5 items)
      Songs           : 10 (9 tags)
      Investments     : 2
      Meldingen       : 4 (3 ongelezen)
      Webhooks        : 1
   🔑 Login: demo@gigsmanager.app / Demo1234!
```

---

## 2. Veilig uitvoeren (data van bestaande accounts blijft intact)

Het script is zo gebouwd dat het `jonasvh39@gmail.com` (of enig ander account)
niet kan raken:

1. **Elke schrijfactie is gekoppeld aan de nieuwe demo-user-id.** Alle `create`
   calls gebruiken de `userId` van de demo-User; alle `deleteMany` calls filteren
   expliciet op `userId` (of op ids die uit die `userId` zijn opgehaald).
   Er staat nergens een `updateMany`/`deleteMany` zonder `userId`-filter.
2. **Idempotent.** Bestaat `demo@gigsmanager.app` al, dan stopt het script met
   een melding en wordt er niets geschreven. Alleen `--reset` verwijdert, en
   dan uitsluitend het demo-account zelf.
3. **Geen cascades nodig.** `removeDemoAccount()` verwijdert alle child-rows
   expliciet (song_bands, song_tags, song_attachments, GigBandMember,
   SetlistItem + attachments, InvestmentContributor, WebhookLog, ShareLinkGig …)
   in de juiste volgorde: eerst gigs, dan setlists (omdat `Gig.setlistId` naar
   `Setlist` verwijst), en `bands` als laatste (die tabel heeft geen FK naar User).
4. **Geen overschrijving van de echte seed.** `prisma/seed.ts` is ongewijzigd.
5. **Guards.** Als `DEMO_SUPABASE_ID` al bij een ander e-mailadres hoort, stopt
   het script met een fout in plaats van te overschrijven.

### Aanbeveling: eerst tegen een aparte database draaien

De `.env` van dit project wijst naar de gedeelde Supabase-database. Om
absoluut geen risico te lopen kun je éénmalig tegen een tweede database seeden:

```powershell
$env:DATABASE_URL = "postgresql://.../demo_staging"   # of een lege Supabase DB
npm run db:seed:demo:reset -- --skip-auth
```

Of maak eerst een snapshot/export in de Supabase SQL-editor voordat je
`--reset` gebruikt.

---

## 3. Wat er precies wordt aangemaakt

Alle datums zijn **dynamisch** ten opzichte van vandaag, zodat de demo-data er
altijd actueel uitziet.

**Bands (2)** — `The Electric Echoes` (pop/rock, `#6366f1`) en
`Acoustic Duo Velvet` (ceremonie/acoustic, `#ec4899`).

**Band members (5)** — telefoon, e-mail, avatar (DiceBear initials) en
`bands`-koppeling met bandnamen (zoals `BandsTab`/`GigForm` verwachten):
Nora Vandeweghe, Elias Janssens (in beide bands), Maya Okonkwo, Finn De Ridder
(Echoes) en Sofie Lambert (Velvet).

**Gigs (6)**

| # | Optreden | Datum | Status |
|---|---|---|---|
| 1 | Zomerfestival Rivierland | −32 dagen | `paymentReceived` + `bandPaid`, gegageerd |
| 2 | Bedrijfsfeest Vandermeulen | −18 dagen | `paymentReceived` + `bandPaid`, gegageerd |
| 3 | Trouwenis Van Gompel | −9 dagen | `paymentReceived` + `bandPaid`, gegageerd |
| 4 | Nieuwejaarsbrug — Marktplein Gent | +14 dagen | betalingen open, **setlist gekoppeld** |
| 5 | Bruiloft Peeters — Kasteel d'Urbex | +27 dagen | betalingen open, setlist gekoppeld |
| 6 | Zandstock Festival — optie | +38 dagen | `isTentative: true`, `performanceFeeUnknown: true` |

Elke gig heeft `bookingDate`, `performanceLineup`, technische fee, bonus
(percentage én vast), voorschot (`advanceReceivedByManager`) en meerregelige
notes met de rekenkunde erbij. `GigBandMember.earnedAmount` is exact
`performanceFee / numberOfMusicians`, dus identiek aan wat
`calculateGigFinancials()` in de UI berekent — de gage-overzichten in
"Banden & leden" kloppen dus ook.

**Repertoire (10 songs + 9 tags)** — 6 voor de Echoes, 4 voor Velvet, elk met
`[[song-meta]]`-blok (bandProject, genre, toonsoort, BPM, commentaar) plus
structuurnotities, gekoppeld via `song_bands` en `song_tags`.

**Setlists (2)** — `Festival Set — De Hele Nacht` (status `klaar`, 8 items) en
`Ceremonie Set — Bruiloft Peeters` (status `concept`, 5 items), beide met
`title`, `chords`, `tuning`, `notes` en specials (`type: "note"`). De metadata
staat in `description`, in exact het formaat dat `SetlistsTab` schrijft.

**Financiën** — `In-Ear Monitor Systeem (4 kanalen)` €1.480 (gedeeld met Nora
en Finn via `InvestmentContributor`) en `Onderhoud PA-installatie & nieuwe
delay-toren` €675 (eigen rekening).

**Meldingen & webhook** — 3 ongelezen (openstaande betaling, optreden over 14
dagen, nieuwe optie) + 1 gelezen (betaling ontvangen), en één webhook die
bewust `enabled: false` staat zodat er tijdens een demo geen HTTP-calls gaan.

---

## 4. Inloggen in de app

Bij het draaien met `SUPABASE_SERVICE_ROLE_KEY` in je omgeving maakt het script
automatisch het Supabase-auth-account aan (`demo@gigsmanager.app` /
`Demo1234!`) en schrijft het echte Supabase-id terug naar `User.supabaseId`,
want daarop zoekt de applicatie gebruikers op.

Zonder service-role-key (of met `--skip-auth`) wordt de login overgeslagen; maak
dan zelf een user aan in **Supabase → Authentication → Users** met
`email_confirm = true`.

---

## 5. Aanpassen

Alles staat in `buildDemoPlan()` als losse, getypte objecten — geen templates,
geen SQL. Wil je andere namen, bedragen of een ander aantal gigs? Pas de
objecten aan; ids en foreign keys worden automatisch kloppend gehouden.

| Variabele | Standaard | Betekenis |
|---|---|---|
| `DEMO_SUPABASE_ID` | `demo-gigsmanager-demo-account` | tijdelijke `supabaseId` |
| `DEMO_PASSWORD` | `Demo1234!` | wachtwoord voor de demo-login |
| `DATABASE_URL` | uit `.env` | welke database geraakt mag worden |

---

## 6. ID- en datakeuzes

- Modellen met `@default(cuid())` krijgen een expliciet gegenereerd, cuid-achtig
  id (`c` + timestamp + teller + random, 25 tekens).
- `bands`, `songs`, `tags`, `song_bands` en `song_tags` hebben géén default in
  het schema en krijgen daarom een UUID — precies zoals de applicatie zelf ze
  aanmaakt (`crypto.randomUUID()` in `/api/bands` en `/api/songs`).
- `songs.notes` en `Setlist.description` gebruiken de serializers van de UI,
  zodat metadata, tabs, concert-mode en PDF-export meteen werken.

---

## 7. CI/CD

`.github/workflows/ci.yml` heeft twee jobs:

**`verify`** (push + PR op `main`, en handmatig) draait in deze volgorde:
checkout → Node 22 → `npm ci` → `npx prisma generate` → `npm run lint` →
`npx tsc --noEmit` → `npm test` → `npm run build`.

- **Node 22** is verplicht: Prisma 7 vraagt `^20.19 || ^22.12 || >=24`
  (`node_modules/prisma` engines). De oude CI draaide op Node 18 en liep daar
  al op stuk.
- **Placeholders in plaats van secrets.** `DATABASE_URL`/`DIRECT_URL` zijn
  placeholders: `DIRECT_URL` moet bestaan, want `prisma.config.ts` doet
  `env("DIRECT_URL")` en gooit anders `Cannot resolve environment variable:
  DIRECT_URL.` — dat brak ook `npm ci`, omdat `postinstall` `prisma generate`
  aanroept. Er wordt in `verify` nergens een databaseverbinding geopend.
- **`npx tsc --noEmit` dekt ook dit script mee**, omdat `tsconfig.json`
  `"include": ["**/*.ts"]` gebruikt en `scripts/` dus meeloopt. De npm-scripts
  `db:seed:demo*` veranderen niets aan build of typecheck.
- **`npm test` staat op `continue-on-error`.** Op `main` faalt
  `test/band-tag-contrast.test.ts` (1 van 113 tests): de "soft" band-tag kiest
  zijn tekstkleur op basis van de donkere modus-composiet, waardoor lichte
  bandkleuren in lichte modus witte tekst krijgen. Dat is een bestaande bug,
  geen gevolg van deze scripts. Zodra die gefixt is, haal
  `continue-on-error` weg en wordt de suite een harde gate.

**`demo-seed`** draait **alleen handmatig** (`workflow_dispatch`, en alleen na
een geslaagde `verify`), tegen de protected environment `staging`.

1. Maak in GitHub een environment `staging` aan met reviewers.
2. Zet secrets `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL` (optioneel) en
   `STAGING_SUPABASE_SERVICE_ROLE_KEY` (alleen nodig voor auth) en variables
   `STAGING_SUPABASE_URL` en `STAGING_DEMO_PASSWORD`.
3. Start de workflow handmatig; de guard-stap weigert te seeden als
   `STAGING_DATABASE_URL` ontbreekt of nog de placeholder is.
4. De invoer `seed_supabase_auth` bepaalt of er ook een Supabase-login wordt
   aangemaakt (standaard uit).

Er staat bewust **geen productie-URL** in deze workflow, en het seeder-script
schrijft uitsluitend rijen voor `demo@gigsmanager.app`.

`.github/workflows/keepalive.yml` is verwijderd: die pingde een REST-endpoint
met secrets die niet bestaan (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) en zou dus
altijd falen. De werkende variant `keep-alive.yml` (pingt de
`/api/health`-endpoint, echte `SELECT 1`) blijft ongewijzigd.


