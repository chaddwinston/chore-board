# Chore Board

A household chore board that installs on iPhone like an app (PWA). Data syncs live between devices through Firebase (Auth + Firestore) and works offline.

- `src/` — app source (`app.js`), Firebase settings (`firebase-config.js`), starter schedule (`starter.js`), service worker template (`sw.js`)
- `docs/` — the built site that GitHub Pages serves
- `firestore.rules` — security rules template (paste into Firebase → Firestore → Rules with your household's emails)

## Rebuild after changes
```
npm install
./build.sh
```
Commit `docs/` afterwards. The build stamps a new service-worker version so phones pick up the update on the next launch or two.

## Install on iPhone
Open the site in Safari → Share → **Add to Home Screen**, then open it from the new icon and sign in.
