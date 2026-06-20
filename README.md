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

Sign in once with your email (a one-tap link is sent; no password). Then:

- **Log** -- optionally type a remark, then tap a category (**PGI**, **VKPI**,
  **DA PGI**, **DA VKPI**). The booking is saved instantly with the current time.
- **All** -- the full list. Tap the pencil to edit a booking (category/remark;
  the original time is kept) or the cross to delete it. **Export** builds a CSV
  of every booking; on a phone it opens the share sheet (Mail, WhatsApp, ...),
  on desktop it downloads. **Clear** removes everything (it asks first).

## Change the categories

Edit the `CATEGORIES` array at the top of [`app.js`](app.js); the buttons and the
edit dropdown both follow it. After changing any cached file, bump `CACHE` in
[`sw.js`](sw.js) -- e.g. `lukis-v4` -> `lukis-v5` -- so installed devices fetch
the new version instead of serving the cached old one.

## CSV format

Columns are `Saved at`, `Category`, `Remark`, separated by `;` with a UTF-8 BOM,
which de-CH/de-DE Excel opens cleanly (correct encoding, one booking per row).

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
3. **Auth**: enable the **Email/Password** provider with **Email link
   (passwordless sign-in)** turned on.
4. **Auth -> Settings -> Authorized domains**: add `msallin.github.io`.
5. **Firestore -> Rules**: publish

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/entries/{entryId} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

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
