# Two-account multiplayer E2E

The acceptance test is `e2e/multiplayer-two-account.spec.ts` and can be run with:

```powershell
npm run test:e2e:multiplayer
```

To create `.env.test.local` interactively without echoing passwords, use:

```powershell
npm run e2e:setup
```

The wizard asks for the isolated Supabase/database settings and disposable A/B/C accounts. It refuses known production/live URLs and writes only the local ignored file. It does not prove that the supplied project is isolated; verify that manually in the Supabase dashboard before proceeding.

The command first runs `scripts/verify-multiplayer-e2e-env.ts`. It loads
`.env.test.local` when present and refuses to start the mutating browser test
unless the environment is explicitly marked isolated, all required
secrets/accounts exist, production hosts are absent, and the Supabase project
reference appears in both database URLs.

It is deliberately mutation-gated. The test skips unless all of the following are set:

```powershell
$env:E2E_ALLOW_MUTATIONS = "1"
$env:E2E_ISOLATED_DATABASE = "1"
$env:E2E_ACCOUNT_A_EMAIL = "..."
$env:E2E_ACCOUNT_A_PASSWORD = "..."
$env:E2E_ACCOUNT_B_EMAIL = "..."
$env:E2E_ACCOUNT_B_PASSWORD = "..."
$env:E2E_ACCOUNT_C_EMAIL = "..."
$env:E2E_ACCOUNT_C_PASSWORD = "..."
```

The three accounts must be disposable accounts in a dedicated Supabase Auth project and database. Do not point this test at production. Copy `.env.test.example` to `.env.test.local` and fill it with the matching isolated project's database and Supabase API settings. Credentials are read only from the process environment and are never printed.

For an already-running isolated deployment, set `PLAYWRIGHT_BASE_URL` and Playwright will not start a local server:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://staging.example.invalid"
```

For a local run, leave `PLAYWRIGHT_BASE_URL` unset; Playwright starts `npm run dev` on port 3000.

The test creates a uniquely named band through Account A, generates an invite, joins it through an independent Account B browser context, compares the band-scoped roster responses from both contexts, refreshes both clients, and verifies Account C cannot see the band. It does not log tokens, passwords, raw invite codes, or private response bodies.

## CI

Add a protected `multiplayer-e2e` environment with non-production secrets and variables, then add a job after the normal build/verification job:

```yaml
multiplayer-e2e:
  needs: verify
  runs-on: ubuntu-latest
  environment: multiplayer-e2e
  env:
    DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
    DIRECT_URL: ${{ secrets.E2E_DIRECT_URL }}
    NEXT_PUBLIC_SUPABASE_URL: ${{ vars.E2E_SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.E2E_SUPABASE_SERVICE_ROLE_KEY }}
    PLAYWRIGHT_BASE_URL: ${{ vars.E2E_BASE_URL }}
    E2E_ALLOW_MUTATIONS: "1"
    E2E_ISOLATED_DATABASE: "1"
    E2E_ACCOUNT_A_EMAIL: ${{ secrets.E2E_ACCOUNT_A_EMAIL }}
    E2E_ACCOUNT_A_PASSWORD: ${{ secrets.E2E_ACCOUNT_A_PASSWORD }}
    E2E_ACCOUNT_B_EMAIL: ${{ secrets.E2E_ACCOUNT_B_EMAIL }}
    E2E_ACCOUNT_B_PASSWORD: ${{ secrets.E2E_ACCOUNT_B_PASSWORD }}
    E2E_ACCOUNT_C_EMAIL: ${{ secrets.E2E_ACCOUNT_C_EMAIL }}
    E2E_ACCOUNT_C_PASSWORD: ${{ secrets.E2E_ACCOUNT_C_PASSWORD }}
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npx prisma migrate deploy
    - run: npm run test:e2e:multiplayer
```

The CI job must reset or provision its isolated database before the test and must retain Playwright traces/reports only in the protected CI artifact store. The current repository workflow does not have this job or the required protected environment, so a real two-account browser run is not currently available from ordinary CI.
