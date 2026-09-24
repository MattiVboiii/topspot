"use client";

import { CoverArt } from "@/components/party/CoverArt";
import { fill, useT } from "@/lib/i18n/LocaleProvider";
import type {
  SpotifyPlaylistSummary,
  SpotifySearchTrack,
} from "@/lib/types/party";

type Props = {
  playlistQuery: string;
  playlists: SpotifyPlaylistSummary[];
  selectedPlaylist: SpotifyPlaylistSummary | null;
  playlistTracks: SpotifySearchTrack[];
  selectedIds: Set<string>;
  loadingPlaylists: boolean;
  addingFallback: boolean;
  onPlaylistQueryChange: (value: string) => void;
  onOpenPlaylist: (playlist: SpotifyPlaylistSummary) => void;
  onClearPlaylist: () => void;
  onToggleTrack: (trackId: string) => void;
  onAddFallback: (all: boolean) => void;
};

export function HostFallbackPlaylist({
  playlistQuery,
  playlists,
  selectedPlaylist,
  playlistTracks,
  selectedIds,
  loadingPlaylists,
  addingFallback,
  onPlaylistQueryChange,
  onOpenPlaylist,
  onClearPlaylist,
  onToggleTrack,
  onAddFallback,
}: Props) {
  const t = useT();

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
        {t.settings.fallbackTitle}
      </h3>
      <p className="mb-3 text-sm text-white/55">{t.settings.fallbackBody}</p>
      <input
        value={playlistQuery}
        onChange={(e) => onPlaylistQueryChange(e.target.value)}
        placeholder={t.settings.searchPlaylists}
        className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none ring-emerald-400/40 focus:ring-2"
      />
      {loadingPlaylists && (
        <p className="mt-2 text-sm text-white/50">
          {t.settings.searchingPlaylists}
        </p>
      )}
      {!selectedPlaylist && (
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {playlists.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenPlaylist(p)}
                className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left hover:bg-white/10"
              >
                {p.imageUrl ? (
                  <CoverArt
                    src={p.imageUrl}
                    size={40}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-white/10" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {p.name}
                  </span>
                  <span className="block truncate text-xs text-white/50">
                    {p.ownerName} ·{" "}
                    {fill(t.settings.tracksCount, {
                      count: p.trackCount,
                    })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedPlaylist && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium text-white">
              {selectedPlaylist.name}
            </p>
            <button
              type="button"
              className="text-sm text-emerald-300"
              onClick={onClearPlaylist}
            >
              {t.settings.back}
            </button>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {playlistTracks.map((track) => {
              const checked = selectedIds.has(track.id);
              return (
                <li key={track.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleTrack(track.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {track.name}
                      <span className="text-white/45">
                        {" "}
                        · {track.artists}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={addingFallback}
              onClick={() => onAddFallback(false)}
              className="flex-1 rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-sky-950 disabled:opacity-50"
            >
              {t.settings.addSelected}
            </button>
            <button
              type="button"
              disabled={addingFallback}
              onClick={() => onAddFallback(true)}
              className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t.settings.addWholePlaylist}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
