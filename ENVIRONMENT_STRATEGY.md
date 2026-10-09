# Dev, Staging en Productie

## Doel

Lokale ontwikkeling en tests mogen nooit verbinden met productie. De aanbevolen minimale scheiding bestaat uit drie onafhankelijke Supabase-projecten en drie afzonderlijke deploymentconfiguraties:

- **Development:** lokaal, eigen `.env.local` of lokale Postgres/Supabase-stack.
- **Staging/Test:** apart Supabase-project, aparte Auth-users, aparte deployment en aparte secrets.
- **Production:** uitsluitend de beschermde productie-deployment en productie-secrets.

Gebruik nooit een productie-`DATABASE_URL`, `DIRECT_URL`, Supabase URL, anon key of service-role key in `.env.test.local`.

## Git-workflow

- `main`: productiecode; beschermd, alleen via pull request en groene checks.
- `staging`: integratiebranch; automatische deployment naar staging.
- `feature/<naam>`: korte featurebranches vanaf `staging`.
- Hotfixes starten vanaf `main`, gaan eerst door staging en worden daarna teruggemerged naar `main`.

Bescherm `main` en `staging` met required reviews, status checks en secret-less pull-request builds. Laat geen workflow automatisch deployen naar productie vanuit een featurebranch.

## Hosting

Kies een provider die twee onafhankelijke services of projecten ondersteunt, bijvoorbeeld Railway of Render:

1. Maak een **staging service** die alleen `staging` deployt.
2. Maak een **production service** die alleen `main` deployt.
3. Gebruik verschillende service-namen, domains, environment groups en secret stores.
4. Zet production deploys achter een approval/protected environment.
5. Laat staging uitsluitend naar het staging-Supabase-project wijzen.
6. Laat de app `PLAYWRIGHT_BASE_URL` alleen naar staging wijzen tijdens multiplayer E2E.

De repository bevat nog geen Railway/Render-infrastructuur. Dat moet als platformconfiguratie worden ingericht zonder secrets in Git.

## Database en Auth

Lokale E2E gebruikt bij voorkeur Supabase CLI/Postgres op localhost; een apart niet-productie Supabase-project blijft optioneel voor staging.

Maak minimaal:

- `gigsmanager-dev`: lokaal of persoonlijk ontwikkelproject.
- `gigsmanager-staging`: gedeeld testproject met disposable Auth-accounts.
- `gigsmanager-prod`: productieproject; nooit gebruiken voor tests.

Voer migraties per omgeving uit met de bijbehorende `DIRECT_URL`. Gebruik voor CI bij voorkeur een tijdelijk databaseproject of een geïsoleerde stagingdatabase die vóór de test wordt gereset. De drie E2E-accounts moeten uitsluitend in het staging/testproject bestaan.

## Secretbeheer

- Commit alleen `.env.example` en `.env.test.example` met placeholders.
- Gebruik lokaal `.env.local` voor development en `.env.test.local` voor geïsoleerde E2E.
- Bewaar staging- en production-secrets in de provider/GitHub protected environment secret store.
- Gebruik nooit `Write-Host`, `echo`, debug logging of Playwright tracing om tokens, wachtwoorden, database-URLs of response bodies te tonen.
- Roteer een secret zodra die in logs, screenshots, tickets of chat terechtkomt.
- Controleer vóór een test dat database- en Supabase-projectreferenties bij elkaar horen.

## Lokale VS Code-workflow

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.test.example .env.test.local
# Vul beide bestanden handmatig in; commit ze nooit.
npm run dev
```

Voor multiplayer E2E:

```powershell
npm run test:e2e:multiplayer
```

De command laadt `.env.test.local` en draait eerst `scripts/verify-multiplayer-e2e-env.ts`. De test start niet wanneer de `local`/`isolated`-markering, testaccounts, lokale databasecontrole of veilige hostcontrole ontbreekt. Vul credentials handmatig in; deel ze niet via terminal, chat of commit.

Voor een externe stagingdeployment zet je `PLAYWRIGHT_BASE_URL` in `.env.test.local`. Voor lokaal testen blijft die variabele leeg en start Playwright de lokale dev-server.

## Eerste inrichting

1. Start lokale Supabase (`supabase start`) of lokale Postgres op poort 54322.
2. Voer de bestaande Prisma-migraties uit tegen de lokale `DIRECT_URL`.
3. Maak drie disposable Auth-users aan in de lokale Supabase Auth-instance.
4. Maak `.env.test.local` via `npm run e2e:setup` en kies `local`.
5. Controleer dat Supabase API en beide database-URL’s localhost gebruiken.
5. Start `npm run test:e2e:multiplayer`.
6. Configureer pas daarna een protected CI environment met dezelfde stagingwaarden als GitHub secrets/variables.
7. Voeg de Playwright-job toe aan CI met `npx playwright install --with-deps chromium` en `npx prisma migrate deploy`.

Deze repository kan de Supabase-projecten, hostingservices en private credentials niet zelfstandig aanmaken. Die stappen vereisen handmatige provider-toegang.
