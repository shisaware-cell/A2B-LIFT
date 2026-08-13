# A2B LIFT - Premium Ride Experience

## Overview
A luxury ride-hailing platform built with Expo (React Native) frontend and Express.js backend. Features client (rider) mode, driver mode, and a web-based admin panel.

## Tech Stack
- **Frontend**: Expo Router (file-based routing), TypeScript, React Native
- **Backend**: Express.js + Socket.io (WebSocket), TypeScript
- **Database**: Supabase PostgreSQL with Drizzle ORM (SUPABASE_DB_URL)
- **Styling**: React Native StyleSheet, Inter font family
- **Real-time**: Socket.io for GPS updates and ride events

## Project Structure
```
app/                    # Expo Router screens
  index.tsx             # Splash/landing screen
  login.tsx             # Login screen
  register.tsx          # Registration screen
  role-select.tsx       # Role selection (Client/Driver)
  chauffeur-register.tsx # Driver vehicle registration
  client/               # Client (rider) tab screens
    _layout.tsx         # Tab layout with liquid glass
    index.tsx           # Ride booking with vehicle categories
    trips.tsx           # Trip history
    wallet.tsx          # Wallet & payment methods
    profile.tsx         # Profile & settings
    notifications.tsx   # Notifications inbox
    safety.tsx          # AI safety reports
    help.tsx            # FAQ & support
    settings.tsx        # Profile editing
    chat.tsx            # In-ride chat
  chauffeur/            # Driver tab screens
    _layout.tsx         # Tab layout with liquid glass
    index.tsx           # Dashboard with online toggle, notification bell badge, ETA/distance
    notifications.tsx   # Notifications inbox (hidden tab, accessed via bell icon)
    rides.tsx           # Ride history
    earnings.tsx        # Earnings & withdrawals
    wallet.tsx          # Wallet with Paystack bank withdrawals (SA banks)
    settings.tsx        # Settings with vehicle/docs/notifications/help modals, profile photo, email
server/
  index.ts              # Express server entry
  routes.ts             # API routes + Socket.io
  storage.ts            # Database operations (Drizzle)
  luxuryPricingEngine.ts # Category-based pricing logic
  templates/
    landing-page.html   # Landing page
    admin.html          # Admin panel
shared/
  schema.ts             # Database schema (Drizzle)
```

## Vehicle Categories & Pricing
| Category | Base Fare | Price/km | Examples |
|----------|-----------|----------|----------|
| Budget | R50 | R7/km | Toyota Corolla, Toyota Quest |
| Luxury | R100 | R13/km | BMW 3 Series, Mercedes C Class |
| Business Class | R150 | R40/km | BMW 5 Series, Mercedes E Class |
| Van | R120 | R13/km | Hyundai H1, Mercedes Vito, Staria |
| Luxury Van | R200 | R50/km | Mercedes V Class |

Fare formula: `base_fare + (distance × price_per_km)`
Late night premium (22:00-05:00): 30% surcharge
Commission rate: 15%

## Maps
- Platform-specific map components: `A2BMap.web.tsx` (Google Maps JS API) and `A2BMap.native.tsx` (react-native-maps pinned to 1.18.0)
- Dark luxury map styling on both platforms
- Google Directions API for route polylines (`/api/directions` endpoint)
- Socket event `location:update` broadcasts driver GPS to clients
- Chauffeur dashboard shows live map when online with route to pickup/dropoff

## Key Features
- Authentication with bcrypt password hashing
- Role-based UI (Client vs Driver)
- 5 vehicle categories with transparent pricing
- Real-time ride status via Socket.io
- Driver GPS location tracking with live map on both client and driver screens
- Haversine distance calculation with Nominatim geocoding (server-side fallback for web)
- Late-night premium (30% surcharge 22:00-05:00) shown in fare breakdown
- Earnings tracking with 15% commission
- Withdrawal system
- Payment methods with card form (persisted via AsyncStorage), EFT, and cash
- In-app chat and phone calling
- AI-powered safety reports
- Notification system
- Chauffeur settings modals (Vehicle Details, Documents, Notifications, Help)
- Admin panel at /admin

## API Endpoints
- `GET /api/geocode?address=...` - Server-side geocoding via Nominatim OpenStreetMap
- `POST /api/pricing/estimate` - Price estimate with category-based pricing
- `POST /api/auth/register` / `POST /api/auth/login` - Authentication
- `GET /admin` - Admin panel (web)

## Database Schema
- **users**: id, username, password, name, phone, role, rating, walletBalance
- **chauffeurs**: id, userId, carMake, vehicleModel, plateNumber, vehicleType, carColor, phone, passengerCapacity, luggageCapacity, isOnline, isApproved, earningsTotal, lat, lng
- **rides**: id, clientId, chauffeurId, pickup/dropoff coords+address, status, price, pricePerKm, baseFare, distanceKm, vehicleType, paymentMethod
- **earnings**: id, chauffeurId, rideId, amount, commission
- **withdrawals**: id, chauffeurId, amount, status
- **messages**: id, rideId, senderId, messageText
- **safetyReports**: id, userId, rideId, type, description, status, aiResponse, priority
- **notifications**: id, userId, title, body, type, isRead

## Theme
- Premium black & white design
- Colors: #000000 (primary), #121212 (cards), #FFFFFF (text), #BDBDBD (secondary text)
- Font: Inter (Google Fonts)

## Admin Panel
- Accessible at /admin route on the backend (username: `admin`, password: `Admin@2026!`)
- Overview stats, driver management, ride monitoring, withdrawal approvals, safety reports
- **Chauffeur management**: Approve, reject, edit vehicle info, view documents, delete drivers
- **Driver Applications**: Dedicated section with approve/reject/delete/notes actions, filtered by status
- **Delete**: Deleting a chauffeur also removes their associated driver application
- Chauffeur registration uses upsert to prevent duplicate records per user

## Replit Configuration
- **Backend** runs on port 5000 (webview) via `npm run server:dev` (tsx)
- **Frontend** (Expo Metro) runs on port 8081 via `expo start --port 8081`
- CORS allows Replit dev domains (`REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`)
- Helmet CSP `frame-ancestors` set to allow Replit preview iframe
- Required environment variables (all set as secrets/env vars):
  - `SUPABASE_DB_URL` - Supabase PostgreSQL connection string
  - `JWT_SECRET` - JWT signing secret
  - `GOOGLE_API_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Maps
  - `PAYSTACK_SECRET_KEY` - Paystack live secret key (sk_live_...)
  - `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` - Paystack live public key (pk_live_...)
  - `SUPABASE_URL` - Supabase project URL
  - `GITHUB_TOKEN` - For Railway auto-deploy via git push

## Payment Flow (Live)
- Paystack is configured with LIVE keys (not sandbox)
- Card payments: initialize via `/api/paystack/initialize` → Paystack hosted page → webhook `charge.success`
- Wallet payments: deducted from user wallet balance on trip completion
- Cash payments: auto-marked as paid when trip status → `trip_completed`
- Commission: 15% platform fee tracked per trip in `earnings` table
- Paystack webhook URL (must register in Paystack dashboard): `https://api-production-0783.up.railway.app/api/paystack/webhook`

## Driver Withdrawals
- Drivers request withdrawals from the Earnings screen (bank details form)
- Backend: POST `/api/wallet/withdraw` — creates Paystack transfer recipient + initiates transfer
- Paystack sends money from A2B LIFT Paystack balance to driver's bank account
- **Requires**: "Automated Transfers" enabled in Paystack dashboard (Settings → Transfers)
- Withdrawal history tracked in `withdrawals` table

## Commission Tracking
- Every completed trip: `earnings` table stores `amount` (driver's 85%) and `commission` (platform's 15%)
- `chauffeurs.earningsTotal` tracks running driver balance
- Admin dashboard shows: Total Revenue, Platform Commission, Driver Earnings
- Webhook deduplication prevents double-counting earnings per ride

## Railway Deployment (Production Backend)
- Production API URL: `https://api-production-0783.up.railway.app`
- Push to GitHub (`git push origin main`) → Railway auto-deploys
- Build: `npm install && npm run server:build`
- Start: `node server_dist/index.js`
- Health check: `/api/health`
- All env vars must be set in Railway dashboard (not .env file)

## App Store Publishing
- **EAS Build**: `eas.json` configured with development/preview/production profiles
- All mobile builds point directly to Railway API: `EXPO_PUBLIC_DOMAIN=https://a2b-lift-backend-production-4fea.up.railway.app`
- iOS: bundle ID `com.a2blift`, buildNumber auto-increments
- Android: package `com.a2blift`, versionCode auto-increments
- Required before submitting to stores:
  1. Run `eas login` and `eas build:configure` to link EAS project ID
  2. Set EAS secrets: `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` (your live pk_live key)
  3. iOS: Apple Developer account + provisioning profile
  4. Android: Google Play Console account + `google-play-key.json` service account
  5. Register Paystack webhook URL in Paystack dashboard
- Permissions configured: Location (foreground), Camera, Photo Library
