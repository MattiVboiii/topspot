# Topspot

Democratic Spotify party jukebox — guests vote, the host plays.

## Setup

1. Create a [Spotify Developer](https://developer.spotify.com/dashboard) app.
   - Redirect URI: `http://127.0.0.1:3000/api/auth/spotify/callback` (Spotify rejects `localhost`)
   - Host account must be **Spotify Premium**
   - After pulling new scopes, re-authorize the app (Sign out → Sign in) so likes/playlist access works
2. Create a Firebase project:
   - Enable **Anonymous** authentication
   - Create a Firestore database
   - Deploy rules from `firestore.rules` and indexes from `firestore.indexes.json`
   - Create a web app + service account for Admin SDK
3. Copy `.env.example` to `.env.local` and fill in values.
4. Run:

```bash
pnpm install
pnpm dev
```

## Flow

- **Host:** Sign in with Spotify → how-it-works → create party → Settings for fallback playlist, downvotes, people, host transfer → play from the host browser
- **Guests:** Open `/p/CODE` or scan QR → how-it-works → (optional name) → search / liked songs, add, vote
- **Queue:** Requests always play before Fallback. Current track leaves the queue when it starts. Progress syncs to guests.
- **Host transfer:** Offer takeover to a guest who linked Spotify Premium; they accept and become the new playback host.

## Stack

Next.js (Vercel) + Firebase Auth/Firestore + Spotify Web API / Web Playback SDK
