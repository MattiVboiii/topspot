import type { Party } from "@/lib/types/party";

/** Party owner — settings, fallback, assign/reclaim music control. */
export function isPartyOwner(party: Party, spotifyId: string): boolean {
  return party.hostSpotifyId === spotifyId;
}

/** Who may run Web Playback + play/pause/skip. Defaults to owner. */
export function playbackControllerId(party: Party): string {
  return party.playbackSpotifyId || party.hostSpotifyId;
}

export function isPlaybackController(party: Party, spotifyId: string): boolean {
  return playbackControllerId(party) === spotifyId;
}

export function musicControlDelegated(party: Party): boolean {
  return playbackControllerId(party) !== party.hostSpotifyId;
}
