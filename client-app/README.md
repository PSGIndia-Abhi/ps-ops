# BestServe Client (Android)

The Android app for BestServe **clients**: company admins and outlet users. It's a separate app
from the staff app in `../mobile`, and both use the same backend, logins and records.

- **App ID:** `com.bestserve.client`. Name: **BestServe Client**. Version 1.0 (versionCode 1).
- **Who can sign in:** client logins only. Staff logins are refused with "This app is for
  BestServe clients only". (The staff app refuses client logins the other way round.)
- **Screens:** Home, Jobs & visits, Complaints, Request a service, Outlets, Documents, Audit
  reports, Profile, Change password, Search.
- **Backend:** the existing client-only endpoints (`/api/client-portal/*`), plus sign-in and push
  registration. It needed no backend change.

## Run (debug)

```
npm install
npm start            # Metro (the staff app uses the same port 8081, so run one at a time)
npm run android
```

Debug builds reach the backend on the PC, using the same rules as the staff app (`src/config/env.ts`).
Release builds use `https://bestserve.co.in`.

## Checks

```
npm run typecheck
npm run lint
npm test
```

## Push notifications (one-time setup)

1. In the BestServe Firebase project, add an Android app with the package name `com.bestserve.client`.
2. Download its `google-services.json` and put it at `android/app/google-services.json`.

Without that file the app still builds and works fully. It just gets no push alerts.

## Release signing

Like the staff app, release builds read `android/keystore.properties`. That file and the keystore
are not committed. Without it, a release build is signed with the debug key, which is fine for
testing but can't be uploaded to Play Store.

## Shared code

The common pieces (theme, icons, loaders, form fields, login screens) are **copies** of the staff
app's files, so the two apps stay independent. If you change one of them in `../mobile`, repeat
the change here if the client app should get it too.
