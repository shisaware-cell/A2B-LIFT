# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in the project root with the following variables:

### Database
```bash
DATABASE_URL=postgres://user:password@host:5432/database_name
```

### Authentication
```bash
JWT_SECRET=your-secret-key-here-minimum-32-characters-long
```

### Google Maps And Google OAuth
```bash
GOOGLE_MAPS_SERVER_API_KEY=your-google-maps-server-key
GOOGLE_API_KEY=your-google-maps-server-key-legacy-fallback
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-native-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

### Supabase (if using Supabase services)
```bash
SUPABASE_URL=https://zzwkieiktbhptvgsqerd.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6d2tpZWlrdGJocHR2Z3NxZXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODA1NjEsImV4cCIaFi2rTJfbyZ6rj6Etecc
```

### External API (103.154.2.122)
```bash
EXTERNAL_API_URL=http://103.154.2.122
EXTERNAL_API_KEY=your-api-key-if-required
EXTERNAL_API_TIMEOUT=30000
```

### Paystack (Optional - for card payments)
```bash
PAYSTACK_SECRET_KEY=sk_test_xxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_CURRENCY=ZAR
PAYSTACK_CALLBACK_URL=https://yourdomain.com/paystack/return
```

### Server Configuration
```bash
PORT=5000
NODE_ENV=development
FRONTEND_URL=https://a2blift.com
PUBLIC_REFERRAL_BASE_URL=https://a2blift.com
```

### Expo/Mobile App
```bash
EXPO_PUBLIC_DOMAIN=https://a2blift.com
EXPO_PUBLIC_REFERRAL_BASE_URL=https://a2blift.com
```

## Setup Instructions

1. Copy this template to a `.env` file in the project root
2. Fill in all required values (especially `DATABASE_URL` and `JWT_SECRET`)
3. The server will automatically load these variables on startup via `dotenv`

## Expo Cloud Build Switching

Use cloud builds to avoid local build instability and slow native compile times.

- Current account (from app config / env):
	- `npm run build:apk:cloud`
	- `npm run build:aab:cloud`
- Pascal account (`pascal225`):
	1. Export Pascal project id once in your shell:
		 - `export EXPO_PUBLIC_EAS_PROJECT_ID_PASCAL="your-pascal-project-id"`
	2. Build using Pascal account:
		 - `npm run build:apk:cloud:pascal`
		 - `npm run build:aab:cloud:pascal`

This does not change your app code. It only switches Expo owner/project for the build command.

## Notes

- **DATABASE_URL**: Your PostgreSQL connection string. If using Supabase, you can get this from your Supabase project settings.
- **JWT_SECRET**: Generate a secure random string (minimum 32 characters). You can use: `openssl rand -base64 32`
- **GOOGLE_MAPS_SERVER_API_KEY**: Preferred backend-only key for Railway/server requests.
- **GOOGLE_API_KEY**: Legacy backend fallback for older deployments.
- **EXPO_PUBLIC_GOOGLE_MAPS_API_KEY**: Used by the Expo app config and native map SDKs at build time.
- **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET**: Used by the backend Google OAuth endpoints.
- **SUPABASE_URL/ANON_KEY**: Already provided above
- **EXTERNAL_API_URL**: Set to `http://103.154.2.122` by default
- **PUBLIC_REFERRAL_BASE_URL / EXPO_PUBLIC_REFERRAL_BASE_URL**: Set these to `https://a2blift.com` in production so shared referral links use your real domain instead of the Railway URL.
- Never commit `.env` file to version control (it should be in `.gitignore`)
