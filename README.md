# Lukis

A tiny offline app for logging data. It runs entirely in the browser, stores
entries on the device, and exports everything to a CSV you can open in Excel or
share by email. No account, no server; once installed it works with no internet.

## Live app

Once GitHub Pages is enabled (see below): https://msallin.github.io/lukisapp/

## Install on a phone

1. Open the link in the phone's browser (Safari on iOS, Chrome on Android).
2. iOS: Share -> **Add to Home Screen**. Android: menu -> **Install app**.
3. Launch it from the home-screen icon. It opens full-screen and works offline.

## Use

- Fill in the fields and tap **Save**. The save time is recorded automatically.
- **Export** builds a CSV of every entry. On a phone it opens the share sheet,
  so you can send it straight to Mail, WhatsApp, etc. On desktop it downloads.
- **Clear** deletes all entries (it asks first).

## Change what gets logged

Edit the `FIELDS` array at the top of [`app.js`](app.js). Each entry there is
one form field and one CSV column. Supported types: `text`, `number`,
`textarea`, `select` (with `options`), `date`, `checkbox`. Nothing else changes.

## Where the data lives

Entries are stored locally in the browser (IndexedDB) and never leave the
device. That means:

- Clearing the browser's site data, or deleting the installed app, erases the
  entries. **Export regularly** -- the CSV is your backup.
- The app asks the browser to keep the data (`navigator.storage.persist`),
  which reduces, but does not entirely remove, the chance of eviction.

## Deploy (GitHub Pages)

1. Push these files to the `main` branch.
2. Repo **Settings -> Pages -> Source: Deploy from a branch -> `main` / `/ (root)`**.
3. Wait for the build, then open `https://<user>.github.io/lukisapp/`.

All asset paths are relative on purpose, so the app works from that project
subpath without any changes.

## Icons

The PNG icons are generated from a background colour and the letter "L" by
[`make-icons.ps1`](make-icons.ps1) (Windows PowerShell). Re-run it after
changing the colour or glyph.
