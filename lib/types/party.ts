export type GuestMode = "anonymous" | "named";

export type Party = {
  id: string;
  code: string;
  hostSpotifyId: string;
  hostDisplayName: string;
  guestMode: GuestMode;
  createdAt: number;
  isActive: boolean;
  nowPlayingTrackId: string | null;
  isPaused: boolean;
  deviceId: string | null;
};

export type PartyTrack = {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  albumArtUrl: string | null;
  durationMs: number;
  uri: string;
  voteCount: number;
  addedBy: string;
  addedByName: string | null;
  addedAt: number;
  isPlaying: boolean;
};

export type PartyGuest = {
  id: string;
  displayName: string | null;
  joinedAt: number;
};

export type PartyVote = {
  trackId: string;
  guestId: string;
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
