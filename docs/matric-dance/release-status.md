# Production release — 12 November 2026

Backend and website deployed on `release/production`: feature commit eecbe88, production bundle refresh b6dbcbd. GitHub Railway deployment checks successful. Matric details page returned HTTP 200 at https://a2blift.com/matric-dance.html. Options API returned HTTP 200 on both a2blift.com and the configured Railway backend; customer and admin booking endpoints returned HTTP 401 without authentication.

Client OTA published and independently verified for iOS + Android on `client-production`, runtime `1.0.0-client`, group `72fccc1e-e8d5-42e4-a524-2cc72ff2ce9c`. Matching backend was verified before publishing. No production paid reservation was placed.

https://expo.dev/accounts/a2bliftclub/projects/a2b-lift-client-eas-mFdHJz/updates/72fccc1e-e8d5-42e4-a524-2cc72ff2ce9c
