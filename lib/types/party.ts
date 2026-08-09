export type GuestMode = "anonymous" | "named";

export type TrackSource = "request" | "fallback";

export type DownvoteMode =
  | "off"
  | "score"
  | "threshold"
  | "score_and_threshold";

export type NowPlayingSnapshot = {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  albumArtUrl: string | null;
  durationMs: number;
  uri: string;
  source: TrackSource;
  startedAt: number;
};

export type Party = {
  id: string;
  code: string;
  /** Permanent party owner (Spotify account that created/owns the party). */
  hostSpotifyId: string;
  hostDisplayName: string;
  guestMode: GuestMode;
  createdAt: number;
  isActive: boolean;
  nowPlayingTrackId: string | null;
  nowPlaying: NowPlayingSnapshot | null;
  isPaused: boolean;
  deviceId: string | null;
  playbackPositionMs: number;
  playbackUpdatedAt: number;
  playbackStartedAt: number | null;
  downvoteMode: DownvoteMode;
  downvoteThreshold: number | null;
  fallbackPlaylistId: string | null;
  fallbackPlaylistName: string | null;
  /** Spotify account currently allowed to control playback (defaults to owner). */
  playbackSpotifyId: string;
  /** Guest doc id of current music controller, if a guest. */
  playbackGuestId: string | null;
  /** Guest invited to take music control (not ownership). */
  pendingPlaybackGuestId: string | null;
};

export type PartyTrack = {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  albumArtUrl: string | null;
  durationMs: number;
  uri: string;
  source: TrackSource;
  voteCount: number;
  upVoteCount: number;
  downVoteCount: number;
  addedBy: string;
  addedByName: string | null;
  addedAt: number;
  isPlaying: boolean;
};

export type PartyGuest = {
  id: string;
  displayName: string | null;
  joinedAt: number;
  spotifyId: string | null;
  spotifyDisplayName: string | null;
  isPremium: boolean;
  /** Updated by presence heartbeat; 0 means left / closed tab. */
  lastSeenAt: number;
  /** True while the guest has an active search/likes browse session. */
  isSearching: boolean;
};

export type PartyVote = {
  trackId: string;
  guestId: string;
  value: 1 | -1;
  createdAt: number;
};

export type SpotifySearchTrack = {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  albumArtUrl: string | null;
  durationMs: number;
  uri: string;
};

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ownerName: string;
  trackCount: number;
  uri: string;
};
