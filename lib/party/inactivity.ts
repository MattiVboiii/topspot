import { getAdminDb } from "@/lib/firebase/admin";
import type { Party } from "@/lib/types/party";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";

export const PARTY_INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;

const DELETE_BATCH_SIZE = 400;

export function partyLastActivityAt(party: Party): number {
  return party.lastActivityAt ?? party.createdAt;
}

export function isPartyInactive(
  party: Party,
  now = Date.now(),
  thresholdMs = PARTY_INACTIVITY_MS,
): boolean {
  return now - partyLastActivityAt(party) >= thresholdMs;
}

/** Fields reset on inactivity clear. Keeps id, code, host, createdAt, isActive. */
export function clearedPartySessionFields(
  party: Party,
  now = Date.now(),
): Partial<Party> {
  return {
    guestMode: "anonymous",
    nowPlayingTrackId: null,
    nowPlaying: null,
    isPaused: true,
    deviceId: null,
    playbackPositionMs: 0,
    playbackUpdatedAt: now,
    playbackStartedAt: null,
    downvoteMode: "off",
    downvoteThreshold: null,
    fallbackPlaylistId: null,
    fallbackPlaylistName: null,
    trackCooldownMinutes: 30,
    maxActiveRequestsPerGuest: 3,
    playbackSpotifyId: party.hostSpotifyId,
    playbackGuestId: null,
    pendingPlaybackGuestId: null,
    lastActivityAt: now,
  };
}

async function deleteCollection(
  db: Firestore,
  ref: DocumentReference,
  subcollection: string,
) {
  const col = ref.collection(subcollection);
  for (;;) {
    const snap = await col.limit(DELETE_BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    if (snap.size < DELETE_BATCH_SIZE) break;
  }
}

/**
 * Clears guests, queue (request + fallback), votes, and session settings.
 * Does not delete the party doc or party code mapping.
 */
export async function clearPartySession(partyId: string): Promise<Party> {
  const db = getAdminDb();
  const ref = db.collection("parties").doc(partyId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Party not found");
  }
  const party = snap.data() as Party;
  const now = Date.now();

  await deleteCollection(db, ref, "tracks");
  await deleteCollection(db, ref, "votes");
  await deleteCollection(db, ref, "guests");
  await deleteCollection(db, ref, "history");

  const updates = clearedPartySessionFields(party, now);
  await ref.set(updates, { merge: true });

  return { ...party, ...updates };
}

export async function touchPartyActivity(
  partyId: string,
  now = Date.now(),
): Promise<void> {
  await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .set({ lastActivityAt: now }, { merge: true });
}

/** If idle ≥ 1 week, wipe session data and return the refreshed party. */
export async function ensurePartyFresh(party: Party): Promise<Party> {
  if (!isPartyInactive(party)) return party;
  return clearPartySession(party.id);
}

export async function clearStaleActiveParties(): Promise<{
  cleared: string[];
  scanned: number;
}> {
  const db = getAdminDb();
  const snap = await db
    .collection("parties")
    .where("isActive", "==", true)
    .get();

  const cleared: string[] = [];
  for (const doc of snap.docs) {
    const party = doc.data() as Party;
    if (!isPartyInactive(party)) continue;
    await clearPartySession(party.id);
    cleared.push(party.id);
  }

  return { cleared, scanned: snap.size };
}
