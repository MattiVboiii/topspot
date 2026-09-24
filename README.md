# TopSpot

Democratic Spotify party jukebox — guests vote, the host plays.

**Live:** [topspotparty.vercel.app](https://topspotparty.vercel.app/) · **License:** MIT · **Version:** 1.0.0

## Stack

Next.js (App Router) · Firebase Auth / Firestore · Spotify Web API + Web Playback SDK · Vercel

## Local setup

1. Create a [Spotify Developer](https://developer.spotify.com/dashboard) app.
   - Redirect URI: `http://127.0.0.1:3000/api/auth/spotify/callback` (Spotify rejects `localhost`)
   - Host account must be **Spotify Premium**
   - After changing scopes, re-authorize (Sign out → Sign in)
2. Create a Firebase project:
   - Enable **Anonymous** authentication
   - Create a Firestore database
   - Deploy rules: `firebase deploy --only firestore`
   - Create a web app + service account for the Admin SDK
   - Add `127.0.0.1` / `localhost` under Authentication → Settings → Authorized domains
3. Copy env template and fill values:

```bash
cp .env.example .env.local
```

4. Install and run:

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Deploy to Vercel

1. Push this repo to GitHub and [import the project in Vercel](https://vercel.com/new).
2. Add every variable from `.env.example` in **Project → Settings → Environment Variables** (Production + Preview as needed).
3. Set production URLs (no trailing slash):

   | Variable               | Example                                                          |
   | ---------------------- | ---------------------------------------------------------------- |
   | `NEXT_PUBLIC_APP_URL`  | `https://your-app.vercel.app`                                    |
   | `SPOTIFY_REDIRECT_URI` | `https://your-app.vercel.app/api/auth/spotify/callback`          |
   | `SESSION_SECRET`       | long random string (`openssl rand -base64 48`)                   |
   | `CRON_SECRET`          | long random string (Vercel Cron sends `Authorization: Bearer …`) |

4. In the Spotify Developer Dashboard, add the **production** redirect URI above.
5. In Firebase Authentication → Authorized domains, add your Vercel domain (and custom domain if any).
6. Deploy. Confirm Firestore rules/indexes are live (`firestore.rules`, `firestore.indexes.json`).

Daily cron (`vercel.json`) hits `/api/cron/cleanup-parties` at 04:00 UTC to clear idle parties.

## Flow

- **Host:** Sign in with Spotify → how-it-works → create party → Settings for fallback playlist, downvotes, people, host transfer → play from the host browser
- **Guests:** Open `/p/CODE` or scan QR → how-it-works → (optional name) → search / liked songs, add, vote
- **Queue:** Requests always play before Fallback. Current track leaves the queue when it starts. Progress syncs to guests.
- **Host transfer:** Offer takeover to a guest who linked Spotify Premium; they accept and become the new playback host.
- **Inactivity:** Parties idle for 7 days are wiped (settings, guests, queue/fallback, playback) but kept active with the same code.

## Scripts

| Command      | Purpose                      |
| ------------ | ---------------------------- |
| `pnpm dev`   | Local development            |
| `pnpm build` | Production build             |
| `pnpm start` | Run production build locally |
| `pnpm lint`  | ESLint                       |

## Security notes

- Never commit `.env.local` or Firebase private keys.
- Host Spotify tokens live in Firestore `hosts/{id}` (Admin SDK only — see `firestore.rules`).
- OAuth `returnTo` is restricted to same-origin relative paths.
