# Computer Migration Guide (Windows)

This guide explains how to move this app and its saved data from one Windows computer to another. It covers saved Weekly Reports, run JSON files, Settings, admin accounts, login audit, and the saved NGAi token.

Only this documentation file is being added for this guide. No application source code or settings are changed by these instructions.

## Important: Copying the Project vs. Cloning from Git

Copying the complete project folder with File Explorer or another file-copy tool will copy the data folders and `.env.local` if they are included in the copy.

A Git clone or GitHub download is not enough to migrate runtime data. The following are excluded by `.gitignore` and are not normally committed to Git:

- `data/`
- `reports/`
- `artifacts/`
- `.browser-profile/`
- `.env.local`

Do not delete or overwrite the old computer's copy until the new computer has been checked and the saved data is visible.

## What to Transfer

### Required for saved app data

Copy the complete `data/` folder. By default, it contains:

- `data/weekly-reports/`: saved daily Weekly Report JSON files, named by date, for example `YYYY-MM-DD.json`.
- `data/latest.json` and other run JSON files: the latest snapshot and saved execution data.
- `data/login-audit.json`: successful login audit records.
- `data/admin-users.json`: additional admin accounts, if any were created.
- Settings JSON files, such as dashboard, theme, pool-system, refresh, and Weekly Report settings.
- `data/ngai-token.json`: the encrypted saved NGAi token, if one was saved in Settings.

The app's default data directory is `data/`. If `.env.local` sets `NGA_DATA_DIR`, copy the directory configured by that variable instead, or make sure the setting points to the copied data on the new computer.

### Recommended configuration files

Copy `.env.local` from the old project folder. It can contain admin credentials, data directory overrides, NGA settings, and other local configuration. Treat it as a secret file; do not email it or upload it to a public location.

Do not replace your real `.env.local` with `.env.example`. The example file is only a template and does not contain your saved configuration or credentials.

### Other generated files

- Copy `reports/` if you want to keep HTML execution report exports saved there.
- Copy `artifacts/` only if you also want screenshots, payload samples, or other generated artifacts.
- Copy `.browser-profile/` only if you want to attempt to retain the Intel SSO browser session. Browser sessions are machine-specific and may need to be recreated on the new computer. This folder contains sensitive browser data.
- Do not copy `node_modules/` or `.next/`; install dependencies and build again on the new computer.

If `.env.local` sets `NGA_REPORTS_DIR`, copy that configured reports directory as well. The defaults are `data/` and `reports/`.

## Step-by-Step Migration

### 1. Stop the app on the old computer

Stop the running app with `Ctrl+C` in its PowerShell window. This prevents files from changing while you make the backup. If the app is running under a scheduled task or another terminal, stop that instance too.

### 2. Make a complete backup

Copy the entire project folder to a secure external drive or another approved secure transfer location. Make sure the copy includes:

- `data/`
- `.env.local`
- `reports/`, if you want its exports
- `artifacts/`, if you want its generated artifacts
- `.browser-profile/`, only if you want to attempt to preserve browser sign-in state

The project folder can be large. It is okay to exclude `node_modules/` and `.next/`; they are regenerated on the new computer. Do not use a Git clone as the only backup because Git excludes the runtime data listed above.

### 3. Transfer the NGAi encryption key, if using a saved Settings token

The saved token in `data/ngai-token.json` is encrypted. By default, its key is stored outside the project folder at:

```text
%USERPROFILE%\.nga-execution-and-report\ngai-token.key
```

On the old computer, `%USERPROFILE%` is the old Windows user's profile folder, such as `C:\Users\OldUser`. Copy `ngai-token.key` securely. On the new computer, create this folder if needed and place the key at the same relative path under the Windows account that will run the app:

```text
%USERPROFILE%\.nga-execution-and-report\ngai-token.key
```

Copy this key before starting the app on the new computer. Keep it private; anyone with the encrypted token file and this key can recover the token.

If you configured `NGAI_TOKEN_ENCRYPTION_KEY` in the server environment instead, use the same value on the new computer. In that case, the environment key is used instead of the generated profile key.

If you do not want to transfer the key, you can instead sign in as an admin on the new computer and save the NGAi token again in Settings. The old encrypted token cannot be decrypted without its original key.

### 4. Transfer the session-signing key only if specifically needed

The app may also have this key in the same profile folder:

```text
%USERPROFILE%\.nga-execution-and-report\session.key
```

It signs app login sessions. Normally, there is no need to transfer it: users can sign in again on the new computer, and old browser sessions should not be relied on during a migration. If you have a specific reason to preserve existing signed sessions, transfer it securely before starting the app. Do not confuse this file with `ngai-token.key`; they serve different purposes.

### 5. Prepare the new computer

1. Install a supported Node.js version and npm on the new Windows computer.
2. Copy the project backup to the desired folder, for example `C:\Apps\NGA_Execution_and_Report`.
3. Confirm that `.env.local` and the required data folder are present. In File Explorer, enable viewing hidden items if needed.
4. If applicable, restore `ngai-token.key` to the new Windows user's profile folder before starting the app.
5. Open PowerShell in the copied project folder.

### 6. Install and build

Run these commands from the project folder:

```powershell
npm install
npm run build
```

If the old computer required corporate certificate or proxy configuration, configure the same approved environment on the new computer. Do not disable TLS certificate verification.

### 7. Start the production app and verify the data

Start the production server:

```powershell
npm start
```

Open `http://localhost:3000` on the new computer. Sign in again. The fixed `root` / `root` login is a read-only viewer. Admin access comes from `APP_ADMIN_USERNAME` and `APP_ADMIN_PASSWORD` in the environment or from `data/admin-users.json`.

You can check that the report archive was copied from another PowerShell window opened in the project folder:

```powershell
Test-Path .\data\weekly-reports
Get-ChildItem .\data\weekly-reports -Filter *.json | Sort-Object Name
Test-Path .\data\login-audit.json
Test-Path .\data\latest.json
```

If you configured `NGA_DATA_DIR`, replace `data` in these checks with the configured directory. In the app, check that archived Weekly Reports, Settings, and login audit records appear as expected. Check Settings to confirm the NGAi token is available; if token decryption fails, restore the original encryption key or save the token again.

### 8. Keep the new server running for automatic reports

The daily report scheduler runs only in production mode, such as when started with `npm start`; `npm run dev` does not run it. The production server process must remain running for automatic report generation and any scheduled email delivery.

The scheduler checks after 12:05 AM IST and generates the previous day's report when NGAi is reachable and configured. If one or more dates are missing from the archive, the scheduler can generate missing dates in sequence after it starts, subject to the required NGAi access and data being available.

For access from other computers on a trusted LAN, use the project's documented LAN production start option and configure network access appropriately. Do not expose the app directly to an untrusted network.

## Security Checklist

- Use an approved secure transfer method for `.env.local`, `data/`, and profile key files.
- Do not commit `data/`, `.env.local`, encryption keys, or browser profile files to Git.
- Restrict access to the new computer and app, especially because `root` / `root` is a fixed viewer login.
- Keep the old computer or backup intact until the new installation is verified.
- After verification, securely remove any temporary copies from transfer media if they are no longer needed.

## Troubleshooting

- **No saved Weekly Reports appear:** confirm the copied `data/weekly-reports/` folder is in the active data directory and check `NGA_DATA_DIR` in `.env.local`.
- **Additional admin users are missing:** confirm `data/admin-users.json` was copied. If admin credentials were configured in environment variables, confirm the new server has the same `APP_ADMIN_USERNAME` and `APP_ADMIN_PASSWORD` values.
- **Login audit is empty:** confirm `data/login-audit.json` was copied into the active data directory.
- **Saved NGAi token cannot be decrypted:** restore the original `ngai-token.key` or the same `NGAI_TOKEN_ENCRYPTION_KEY`; otherwise save the token again from Settings.
- **Automatic report is not generated:** confirm the app is running in production mode, the server remains running, the previous date is not already in the archive, and NGAi access works.
