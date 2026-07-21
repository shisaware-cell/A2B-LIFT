# A2B LIFT — Release Commands

Always release through `scripts/release.sh`. It sets the correct environment per app and
refuses to run if the resolved bundle ID doesn't match the target — this prevents a client
build from ever landing under the driver app again.

## Commands (run from repo root on your Mac)

| What | Command |
|---|---|
| Driver AAB (Play Store) | `bash scripts/release.sh driver android build` |
| Client AAB (Play Store) | `bash scripts/release.sh client android build` |
| Driver iOS build | `bash scripts/release.sh driver ios build` |
| Driver iOS upload to App Store Connect | `bash scripts/release.sh driver ios submit` |
| Client iOS build | `bash scripts/release.sh client ios build` |
| Client iOS upload to App Store Connect | `bash scripts/release.sh client ios submit` |

`ios submit` uploads the **latest finished iOS build** of that app's EAS project.
Always run the matching `ios build` first.

There is also a local (non-EAS) flow: `scripts/build-local-release.sh` and
`scripts/submit-local-release.sh`. Use one flow or the other, not a mix.

## Version & build numbers — bump BEFORE every store build

Defaults live in **`app.config.shared.js`** and can be overridden per-build with env vars:

| Number | Default | Env override |
|---|---|---|
| Marketing version | `1.0.14` | `EXPO_APP_VERSION` |
| Android versionCode (both apps) | `123` | `EXPO_ANDROID_VERSION_CODE` |
| Driver iOS buildNumber | `23` | `EXPO_DRIVER_IOS_BUILD_NUMBER` |
| Client iOS buildNumber | `23` | `EXPO_CLIENT_IOS_BUILD_NUMBER` |

Rules: Google Play requires a versionCode higher than the last upload for that app;
Apple rejects a build number already uploaded for that app + version. Bump by 1 each time,
either by editing the defaults or passing the env var, e.g.
`EXPO_ANDROID_VERSION_CODE=111 bash scripts/release.sh driver android build`.

Driver iOS build 18 was consumed by the mis-uploaded client build — that's why both apps
are now on 19.

## App identifiers (reference)

| | Driver | Client |
|---|---|---|
| Bundle / package | `com.a2blift` | `com.a2blift.client` |
| EAS project | `8ccd04f4-…cb75f` | `9932543b-…ad749` |
| ASC app ID | `6779553841` | `6779557968` |
| Build/submit profiles | `production` / `ios-production` | `client-production` / `client-ios-production` |

All four iOS submit profiles in `eas.json` have `ascAppId` pinned, so even a raw
`eas submit` can no longer pick the wrong App Store Connect app.

## Backend deploys (Railway via GitHub)

**IMPORTANT:** Railway runs the committed `server_dist/index.js` bundle — its build step has
been observed NOT rebuilding it. Before every backend push, rebuild and commit the bundle:

```bash
npm run server:build && git add server_dist && git commit -m "Rebuild server bundle"
```

Verify after deploy: `https://a2blift.com/api/version` must return a `commit` field matching
the pushed SHA.


Railway builds from `railway.json` (`npm run build`, starts `server_dist/index.js`,
healthcheck `/api/health`). Once the repo is connected in Railway
(Service → Settings → Source → Connect Repo → branch `release/production`),
every push to that branch deploys automatically.

Before pushing backend changes: `npm test && npx tsc --noEmit` must pass.
After deploy: `bash scripts/smoke-api.sh https://a2blift.com` must pass.

Admin dashboard: `bash deploy-admin.sh` (Netlify, needs `NETLIFY_AUTH_TOKEN`).
