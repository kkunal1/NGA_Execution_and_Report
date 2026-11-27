# NGA Execution & Report

Internal Next.js application for Intel execution dashboards, historical run analysis,
system coverage, and daily/weekly reports. It supports Intel SSO through the NGA
Testlines browser UI and Intel NGAi through its TestRunComposite OData API. Shared
application data is stored on the server; some view preferences and temporary page
state are stored in the user's browser.

## Quick Start (Windows)

Prerequisites: Node.js 18.18 or newer (Node.js 20 LTS recommended), npm, and access to
the Intel services needed by your selected provider. `npm ci` installs dependencies and
Playwright Chromium through the project's postinstall script.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Edit `.env.local` before starting. Set `APP_ADMIN_USERNAME` to a username other than
`root`, and set a strong `APP_ADMIN_PASSWORD`. The example password is intentionally
blank. Never commit or share `.env.local`; it can contain credentials.

```powershell
npm run dev
```

Open <http://localhost:3000> and sign in with the configured admin credentials. The
fixed `root` / `root` account is a read-only viewer for trusted local use; it is not a
security boundary. If port 3000 is occupied, run `npm run dev -- -p 3100` and open
<http://localhost:3100>.

### Configure a Data Provider

In **Settings → Data source & network**, choose the provider for this browser:

- **Intel NGAi** queries the configured TestRunComposite endpoint directly; it does not
  require Chrome or an SSO browser session. As an admin, enter an NGAi PAT and select
  **Save encrypted token**. The Settings-saved token is encrypted on the server and is
  never returned to the page. `NGAI_API_TOKEN` remains available as a legacy environment
  fallback.
- **Intel SSO** drives the NGA Testlines page with Playwright. Run `npm run doctor` to
  check browser launch, then run `npm run auth` once to sign in interactively. The
  persistent `.browser-profile/` is reused for later captures.

When using NGAi, choose **Connected · direct** or **Proxy** in Settings. Proxy mode uses
the proxy URL saved there. The selected network route applies to future NGAi requests
from that browser. Corporate TLS setup is described under [Network and TLS](#network-and-tls).

## Workspace Guide

Admins always have access to all tools. Viewer access can be changed in **Settings →
Navigation Visibility**. The **Check Execution Time** visibility setting controls both
Check Execution Time and Check Execution Data.

### Execution Report

The expandable sidebar group contains the built-in **DMR AP1 PV B0 Execution** and
**DMR AP1 PV B2 Execution** dashboards, plus enabled custom execution submenus. Admins
can load data; viewers can inspect the shared saved data and reports. The action follows
the selected provider: Intel SSO captures the Testlines page, while Intel NGAi loads
suite data directly. Admins can add suite names one at a time or paste multiple lines,
select a saved run, and use **Loaded suites** to filter a multi-suite result locally.
Use **HTML report** to open a report or **Download** to save it.

Manage custom submenus in **Settings → Execution Submenus**. Add a name and one or more
NGAi suite names (one per line), then save the tab. Existing tabs can be edited, enabled
or disabled, and reordered. The app allows up to 20 custom tabs and 10 suites per tab.
Custom tabs use the NGAi historical data flow.

### All Execution Systems

Shows systems and uncovered configurations for the configured pools. Select pools to
filter the tables and downloads. Configure pool names and pool-to-suite coverage
mappings in Settings first; each mapping's pool name must match a configured pool.

### Weekly Report

The sidebar group contains these pages:

- **Daily/Weekly Report**: select an execution cycle and saved day, then create or load a
  report. Download it as HTML or copy its report content. Creating a report saves a
  snapshot for that cycle and date. The page includes configured summary, domain,
  failure, HSDES, and custom sections when available.
- **Update Weekly Report**: edit settings for a selected cycle, including suite names,
  BKC, summary text, email subject, CPU allocation, links, and custom tables. Save the
  changes for that cycle. Email subject templates must contain `{{reportDay}}`. Tables
  and CPU allocation can be moved between cycles.
- **Send Report Over Email**: create or load a report first, then return to this page in
  the same browser session. Enter the sender, recipient(s), and your mail password. The
  password is used for that send only and is not saved by the app; sending uses secure
  SMTP.
- **Test Email Design (Temporary)**: admin-only temporary page for previewing the email
  layout; it is not the standard report delivery workflow.

In production, one running Node server finalizes the previous day's report after
12:05 AM IST. Archives are shared through the server's data directory. The development
server does not run the daily report scheduler.

### Check Execution Time

Enter an NGA suite name and submit to view execution totals by subsystem, configuration,
and test. Select **Excel** or **HTML**, then download. Results can be restored for the
current browser session.

### Check Execution Data

Choose a cycle to load all of its suites, or choose one suite within a cycle, then
submit. The overview summarizes historical attempts, mapped systems, cumulative
execution time, and timing gaps. Expand a domain and its categories to inspect attempts;
use **Download HTML** to export the current result. The download filename ends with an
ISO timestamp so repeated downloads have distinct names. The page restores its selection
and result for the current browser session when available.

### Settings (Admin)

Settings is administrator-only and includes:

- Theme and viewer navigation visibility; execution-report aborted-test display.
- Custom execution submenus and sidebar order.
- Additional administrator accounts (passwords are stored as salted hashes).
- Weekly Report section visibility for generated, loaded, and emailed reports.
- Data provider, encrypted NGAi token, and direct/proxy network routing.
- Automatic NGAi refresh interval and per-cycle switches/intervals for B0, B2, and saved
  custom execution cycles. Each cycle can have its own interval in seconds; the global
  default is used for new or unconfigured cycles. Turn a cycle off to skip its scheduled
  NGAi queries while keeping manual **Load NGAi data** available. Existing cycles default
  to enabled for compatibility. Set the global default to `0` to pause all scheduled
  refreshes; active intervals can be 15 seconds to 24 hours. Viewers receive a saved
  snapshot when data changes.
- Pool names and pool/suite coverage mappings used by All Execution Systems.
- Selected data backup and restore. Restore replaces data in selected categories; make
  a backup first. Admin accounts, login audit, API tokens, and mail secrets are excluded
  from the Settings backup.
- Manual SMTP email and **Advanced: scheduled Microsoft Graph email**. Scheduled Graph
  mail requires an IT-approved Entra application with Graph `Mail.Send` application
  permission and admin consent. Configure sender, recipient, time, timezone, and secret
  in Settings. The production server must remain running for scheduled reports/email.
- Successful-login audit records.

The admin-only diagnostic page `/new-job` displays NGA TestRun status summaries and
PreBoot/PostTest/Cleanup step details. It is separate from the main sidebar workflow.

## Run and Test

```powershell
npm run dev             # local development server
npm test                # unit and regression checks
npm run test:e2e        # SSO scraper against a local mock NGA page
npm run test:e2e:ngai   # NGAi flow against mock OData/Graph services
npm run doctor          # check Playwright browser launch (SSO only)
npm run build           # production build
npm start               # production server on 127.0.0.1:3000
npm run lint            # optional; first run asks to create an ESLint config
```

The current `lint` script uses `next lint`, which is deprecated and prompts for an
ESLint configuration when none exists. The first accepted setup creates `.eslintrc.json`;
review that generated file before committing it, then run lint again. `npm run build`
performs the production compile and type validation.

## API Quick Reference

The application APIs are under `src/app/api/`. They use the same sign-in and admin/viewer
permissions as the UI; admin-only operations are enforced server-side.

| Route | Purpose |
| --- | --- |
| `POST /api/scrape` | Capture the Testlines page with the SSO browser provider. |
| `POST /api/test-run-data` | Query NGAi run data for one or more suite names. |
| `POST /api/aborted-tests` | Load aborted-test data for selected suites. |
| `GET/POST /api/execution-data` | List available cycles/suites and load historical execution details. |
| `POST /api/execution-time` | Calculate execution-time summaries for a suite. |
| `POST /api/execution-time/export` | Create the selected Excel or HTML export. |
| `GET /api/runs` | List saved runs or load one using `?runId=`. |
| `GET/POST /api/report` | Open or download a saved execution report; supports `runId` and `download=1`. |
| `GET /api/pool-systems`, `GET /api/pool-systems/uncovered-configs` | Read configured system and uncovered-configuration data. |
| `GET/POST /api/weekly-report` | Load report cycles or create a report snapshot. |
| `GET /api/weekly-report/saved` | List or load saved report snapshots. |
| `GET/PUT/PATCH /api/update-weekly-report` | Read/update cycle settings and move report tables between cycles. |
| `/api/execution-tabs` | List and manage custom execution tabs and sidebar ordering. |
| `/api/settings/*` | Admin settings for users, tokens, navigation, themes, refresh, pools, backups, mail, and audit. |

For a local production server, configure admin credentials, build, then run
`npm start` (binds to `127.0.0.1`). For a trusted LAN deployment, run
`npm run start:lan` (binds to all interfaces). Both commands automatically enable
Node's `--use-system-ca` option. Use Node.js 24 LTS; older Node versions without this
flag cannot run these commands. No manual PowerShell `NODE_OPTIONS` assignment is
needed. On Windows, `npm run start:lan:12h`
restarts the LAN server every 12 hours and sets Node's system-CA option. Do not expose
the development server or fixed viewer login to an untrusted network. Put a shared
deployment behind an approved HTTPS reverse proxy/firewall and keep persistent shared
storage. Read [MIGRATION_README.md](MIGRATION_README.md) before moving an installation.

## Configuration

`.env.example` lists supported variables. Important settings:

| Variable | Purpose |
| --- | --- |
| `APP_ADMIN_USERNAME`, `APP_ADMIN_PASSWORD` | Initial server admin credentials; username must not be `root`. |
| `NGA_URL` | Intel Testlines URL used by the SSO provider. |
| `NGA_FILTER_ENTITY`, `NGA_FILTER_FIELD`, `NGA_FILTER_OPERATOR`, `NGA_SUITE_NAME` | Filter row and default suite for the Testlines browser flow. |
| `NGA_STATE_COLUMN`, `NGA_UNLOCK_BUTTON` | Testlines state column and frozen-page unlock button labels. |
| `NGA_HEADLESS`, `NGA_BROWSER_CHANNEL`, `NGA_PROFILE_DIR` | Playwright browser behavior and persistent profile. |
| `NGA_NAV_TIMEOUT_MS`, `NGA_SETTLE_MS` | Browser navigation and page-settle timing. |
| `NGAI_API_URL` | Approved Intel NGAi TestRunComposite endpoint. |
| `NGAI_API_TOKEN`, `NGAI_COOKIE` | Optional server credentials; prefer saving a PAT in Settings. The env token is a legacy fallback. |
| `NGAI_PAGE_SIZE`, `NGAI_TIMEOUT_MS`, `NGAI_PROXY_URL` | NGAi paging, timeout, and optional server proxy defaults. |
| `NGA_DATA_DIR`, `NGA_REPORTS_DIR` | Persistent data and report-export directories; default to `data/` and `reports/`. |
| `NGAI_TOKEN_ENCRYPTION_KEY` | Optional override for the generated per-user key that encrypts a Settings-saved PAT. |

## Network and TLS

If the corporate proxy re-signs Intel HTTPS certificates and its CA is installed in
Windows, set Node's system certificate option in the same PowerShell window before
running Node commands:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm run dev
```

If the CA is not installed in Windows, ask IT for the complete approved PEM chain and
set this before starting the app:

```powershell
$env:NODE_EXTRA_CA_CERTS='C:\certs\intel-corporate-ca-chain.pem'
npm run dev
```

These are PowerShell commands, not `.env.local` entries. Do not disable TLS verification
with `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Data, Access, and Backups

By default, `data/` stores run snapshots, settings, saved weekly reports, custom
execution tabs, and encrypted NGAi token data. The token encryption key is normally
stored in the current Windows user's `%USERPROFILE%\.nga-execution-and-report\` folder.
Keep that profile key with its Windows account; losing it prevents decryption of the
saved token. `reports/` stores report exports; `artifacts/` stores scraper screenshots
and payload samples; `.browser-profile/` contains sensitive SSO browser state. These
folders and `.env.local` are local runtime data and must not be committed.

The fixed `root` / `root` viewer login is intentionally simple. Anyone who can reach the
server can use it, so restrict network access to trusted users. Admin-only operations
are checked by server APIs as well as hidden in the UI. In a shared deployment, users
share that server's data directory, configured NGAi token, and browser profile.
