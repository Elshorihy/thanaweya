# Thanaweya Android app

This branch prepares the existing React app for an Android package with Capacitor. The website's main branch is not changed.

## App identity

- Display name: ثانوية
- Application ID: `dev.thanaweya.os`
- Web assets: `dist`
- API: the existing `https://thanaweya.sheenomatp.workers.dev` Worker and D1 database

## Local Android project setup

Run from the repository root with Node.js 22+ and Android Studio / Android SDK installed:

```bash
npm install
npm run build
npm run cap:add:android
npm run cap:sync
npm run cap:open
```

Then build the APK from Android Studio.

## Session and API notes

The native WebView uses the secure `https://localhost` origin. The native API bridge sends existing `/api/*` requests to the current Cloudflare Worker. The Worker CORS allow-list includes this Capacitor origin and keeps the existing HttpOnly, Secure, SameSite=None account cookie.

**Native session setup:** `npm run cap:add:android` runs a small patcher after generating the Android project. It enables third-party cookies in the generated `MainActivity` so the existing HttpOnly session cookie can be sent to the Worker. The script stops rather than editing an unexpected MainActivity template.

**Release gates:** the Worker CORS/WebSocket changes in this branch must be deployed to the existing Cloudflare Worker before the native app can use the shared account API. Do not publish an APK until login, logout, account restoration, study-room WebSocket connectivity, and cross-device data sync have been verified on a real Android device. The native package is not considered offline-complete; only locally cached app assets and explicitly cached content can work offline.

## Mobile navigation

The native/mobile layout uses five stable destinations: Home, Curriculum, Plan, Schedule, and Settings. The remaining tools stay available from the existing All Tools menu. Desktop navigation and the original `main` branch remain untouched.
