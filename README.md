# NGA Execution & Report

Next.js app with two Intel data providers. **Intel SSO** drives a persistent Chrome
session against the NGA Testlines page and applies **TestLine / Suite / Equal / the
configured suite**. **Intel NGAi** calls the TestRunComposite OData endpoint directly,
checks the fixed regression suite `Oak_Stream_Platform_1_DMR-Platform_Beta-PAIV-Platform-AP1_Beta_Regression_Cycle`,
and does not open Chrome. Both providers normalize execution states and render results.

## Setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run doctor # verifies Playwright can drive your Chrome
npm test       # state-bucketing / aggregation / filter-verification checks
npm run test:e2e # drives the real scraper against a mock NGA page
npm run test:e2e:ngai # direct NGAi suite query against a mock API, no browser
npm run auth   # one-time interactive Intel SSO sign-in
npm run dev
```

`npm run auth` opens your real Chrome (channel `chrome`) with a persistent profile in
`.browser-profile/`. After signing in once, headless captures reuse that session.

> Port 3000 may already be taken on your machine; use `npm run dev -- -p 3100` if so.

## Shared Access

The app has two roles. Admin credentials are configured with `APP_ADMIN_USERNAME` (use a
name other than `root`) and `APP_ADMIN_PASSWORD` in the server environment. The fixed `root` / `root` account is
read-only: it can view runs and download reports, but cannot load data or change Settings.
Admin-only permissions are enforced by the API as well as the UI.

The fixed viewer password is intentionally simple and is not suitable as a security
boundary. Anyone who can reach the app can sign in as a viewer. Restrict network access
to your trusted team/VPN and put a shared production deployment behind HTTPS. A shared
server has one data store, one NGAi token and one signed-in browser profile; all viewers
see the same captured data.

For a LAN-bound production server, build first and then run `npm run start:lan`. Configure
the admin credentials on the host before starting it. Do not use `npm run dev:lan` for a
shared deployment; development mode is not intended to be exposed to a network.

## Usage

Open http://localhost:3000 and:

- Add one or more suite names in the suite field; press Enter after each name, or paste a newline-separated list. Remove suites with the `x` on each chip.
- After a multi-suite capture, use the **Loaded suites** checkboxes to filter the dashboard and downloaded report locally without another NGAi query.
- In Settings, set **Automatic NGAi refresh** to a whole number from 15 to 3600 seconds (`0` disables it). Keep the admin dashboard open; it checks for changed rows and saves a new shared latest snapshot only when data changes. Viewers pick up that snapshot automatically.
- **Capture (headless)** – runs the scrape in the background and stores a run in `data/`.
- **Capture (visible / sign in)** – same, but with the browser window shown (use if SSO expired).
- **HTML report** – opens `/api/report`, which also writes `reports/execution-report-<runId>.html`.
- **Download** – same report as a file download.

## API

| Route | Purpose |
| --- | --- |
| `POST /api/scrape` | Runs the browser capture, saves and returns the run. Body: `{ "headless": boolean }` |
| `POST /api/test-run-data` | Queries the configured NGAi TestRunComposite endpoint for one or more suites without launching Chrome. Body accepts `suiteNames: string[]` (or legacy `suiteName: string`). |
| `GET/PUT/DELETE /api/settings/ngai-token` | Reports token status, saves an encrypted token, or removes it; never returns the token |
| `GET /api/runs` | Latest run + list of run ids. `?runId=` loads a specific run |
| `GET /api/report` | Standalone HTML report. `?runId=`, `?download=1` |

## How the capture works

1. Persistent Chrome context (`src/lib/browser.ts`) keeps the SSO cookies.
2. `src/lib/scrape.ts` listens to every JSON API response the SPA makes.
3. It sets the filter row (entity / field / operator / value) and clicks **Search**.
4. It raises the grid page size so one capture holds every record.
5. Only payloads produced *after* the Search click are used; otherwise the rendered grid is parsed.
6. `src/lib/normalize.ts` finds the state column and maps each raw value onto a bucket
   (Passed / Failed / Blocked / In Progress / Not Run / Other) — `Infra Error` counts as Blocked, not Failed.
7. `src/lib/summarize.ts` counts tests per bucket, per raw state and per testline.

Every run writes a full-page screenshot to `artifacts/grid-<runId>.png`, the matched API
payload sample to `artifacts/payload-<runId>.json`, and stores `sampleRecord` +
`observedEndpoints` in the run JSON. The dashboard shows the sample record at the bottom —
use it to correct `NGA_STATE_COLUMN` if the counts look wrong.

## Tuning

All targets are environment driven (`.env.local`):

```
NGA_URL, NGA_FILTER_ENTITY, NGA_FILTER_FIELD, NGA_FILTER_OPERATOR, NGA_SUITE_NAME,
NGA_STATE_COLUMN, NGA_HEADLESS, NGA_BROWSER_CHANNEL, NGA_PROFILE_DIR,
NGA_NAV_TIMEOUT_MS, NGA_SETTLE_MS
```

If a capture returns nothing or unfiltered data, the run is flagged with explicit
warnings on the dashboard and in the report instead of silently showing wrong numbers.

Filter-UI selectors live in `applyFilter()` in `src/lib/scrape.ts`.

The provider is selected at `/settings` and persisted in the browser. Intel SSO uses
the Testlines browser flow and its TestLine / Suite / Equal filter. Intel NGAi uses
`NGAI_API_URL` with an OData suite filter; save a PAT from `/settings` or configure
`NGAI_COOKIE` when the gateway requires explicit credentials. `NGAI_API_TOKEN` remains
supported as a legacy fallback and must be an active NGA PAT;
the client sends it in the `X-NGA-PAT` header, not `Authorization: Bearer`. The project uses the explicit `NGAI_API_URL`
endpoint; it does not assume that the internal Intel NGAi agent gateway is available
inside the project process. If a corporate proxy re-signs the Intel
HTTPS certificate and the corporate CA is installed in Windows, use Node's system
certificate store before starting the app in PowerShell:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm run build
npm start
```

If the CA is not in the Windows store, ask IT for the complete corporate CA chain
and use `$env:NODE_EXTRA_CA_CERTS` with its PEM path instead. A single unrelated
certificate file may still produce `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

Do not disable TLS verification with `NODE_TLS_REJECT_UNAUTHORIZED=0`.

To store an NGAi PAT, enter it in `/settings`; no token or encryption-key setup in
`.env.local` is required. The app creates an AES-256-GCM key in the current OS user's
`~/.nga-execution-and-report/` profile and stores the encrypted token in the ignored
`data/ngai-token.json` file. Each colleague running a local copy gets a separate token
and key. Keep the profile key file with its user; if it is lost or changed, the saved
token cannot be decrypted. `NGAI_TOKEN_ENCRYPTION_KEY` can optionally override the
generated key in the server environment. A saved Settings token takes precedence over
the legacy `NGAI_API_TOKEN` variable, and the Settings page never returns it to the
browser.
