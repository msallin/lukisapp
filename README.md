# Lukis

A tiny app for logging flight bookings. Tap one of four category buttons and the
booking is recorded with a timestamp; add an optional remark. Bookings sync to
Firebase Firestore under a passwordless email sign-in, and the app installs as a
PWA that keeps working offline. Everything can be exported to a CSV for Excel.

## Live app

https://msallin.github.io/lukisapp/

## Install on a phone

1. Open the link in the phone's browser (Chrome on Android, Safari on iOS).
2. Android: menu -> **Install app**. iOS: Share -> **Add to Home Screen**.
3. Launch it from the home-screen icon. It opens full-screen and works offline.

## Use

Sign in with your Google account. Then:

- **Log** -- optionally type a remark, then tap a category (**PGI**, **VKPI**,
  **DA PGI**, **DA VKPI**). The booking is saved instantly with the current time.
- **All** -- the full list. Tap the pencil to edit a booking (category/remark;
  the original time is kept) or the cross to delete it. **Export** builds a CSV
  of every booking; on a phone it opens the share sheet (Mail, WhatsApp, ...),
  on desktop it downloads. **Clear** removes everything (it asks first).

## Change the categories

Edit the `CATEGORIES` array at the top of [`app.js`](app.js); the buttons and the
edit dropdown both follow it. After changing any cached file, bump the `CACHE`
version in [`sw.js`](sw.js) (e.g. `lukis-v6` -> `lukis-v7`) so installed devices
fetch the new version instead of serving the cached old one.

## CSV format

Columns are `Saved at`, `Category`, `Remark`, `Created by`, separated by `;` with
a UTF-8 BOM, which de-CH/de-DE Excel opens cleanly (correct encoding, one booking
per row). Each booking also stores the creator's uid and email.

## Where the data lives

Bookings are stored in Firebase Firestore under the signed-in account, with
Firestore's offline cache enabled so the app works with no network and syncs when
it returns. Security rules restrict each account to its own data. The CSV export
is still useful as a portable backup.

## Firebase setup

The web config lives in [`firebase-config.js`](firebase-config.js) (not secret;
safe to commit). To point the app at a Firebase project:

1. Create the project, add a **Web app**, and paste its config into
   `firebase-config.js`.
2. **Firestore**: create a database (Native mode).
3. **Auth**: enable the **Google** sign-in provider.
4. **Auth -> Settings -> Authorized domains**: add `msallin.github.io`.
5. **Firestore -> Rules**: publish the rules from [`firestore.rules`](firestore.rules),
   with the real allowed emails filled in (see "Restricting who can sign in").

## Restricting who can sign in

Google sign-in authenticates any Google account, and Firebase has no built-in
allow-list for it (that needs Identity Platform blocking functions). The simple,
free approach is to enforce an allow-list in the security rules: list the
permitted emails in [`firestore.rules`](firestore.rules) and publish. Anyone else
can still press "Sign in with Google", but every read/write is denied, so the app
does nothing for them and your data and storage stay untouched.

Put the real emails only in the published rules, not in the committed file, so
they are not exposed in the public repo.

## Deploy (GitHub Pages)

1. Push to the `main` branch.
2. Repo **Settings -> Pages -> Source: Deploy from a branch -> `main` / `/ (root)`**.
3. Wait for the build, then open `https://<user>.github.io/lukisapp/`.

All asset paths are relative on purpose, so the app works from that project
subpath without changes.

## Icons

The PNG icons are generated from a background colour and the letter "L" by
[`make-icons.ps1`](make-icons.ps1) (Windows PowerShell). Re-run it after changing
the colour or glyph.
