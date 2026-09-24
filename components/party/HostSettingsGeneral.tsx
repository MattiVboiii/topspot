"use client";

import { useT } from "@/lib/i18n/LocaleProvider";
import type { DownvoteMode, GuestMode } from "@/lib/types/party";

type Props = {
  guestMode: GuestMode;
  downvoteMode: DownvoteMode;
  threshold: string;
  trackCooldownMinutes: string;
  maxActiveRequestsPerGuest: string;
  onGuestModeChange: (value: GuestMode) => void;
  onDownvoteModeChange: (value: DownvoteMode) => void;
  onThresholdChange: (value: string) => void;
  onTrackCooldownChange: (value: string) => void;
  onMaxRequestsChange: (value: string) => void;
};

export function HostSettingsGeneral({
  guestMode,
  downvoteMode,
  threshold,
  trackCooldownMinutes,
  maxActiveRequestsPerGuest,
  onGuestModeChange,
  onDownvoteModeChange,
  onThresholdChange,
  onTrackCooldownChange,
  onMaxRequestsChange,
}: Props) {
  const t = useT();

  return (
    <>
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
          {t.settings.guestIdentity}
        </h3>
        <select
          value={guestMode}
          onChange={(e) => onGuestModeChange(e.target.value as GuestMode)}
          className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
        >
          <option value="anonymous">{t.settings.anonymous}</option>
          <option value="named">{t.settings.named}</option>
        </select>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
          {t.settings.downvotes}
        </h3>
        <select
          value={downvoteMode}
          onChange={(e) =>
            onDownvoteModeChange(e.target.value as DownvoteMode)
          }
          className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
        >
          <option value="off">{t.settings.downvoteOff}</option>
          <option value="score">{t.settings.downvoteScore}</option>
          <option value="threshold">{t.settings.downvoteThreshold}</option>
          <option value="score_and_threshold">
            {t.settings.downvoteScoreAndThreshold}
          </option>
        </select>
        {(downvoteMode === "threshold" ||
          downvoteMode === "score_and_threshold") && (
          <label className="mt-3 block text-sm text-white/70">
            {t.settings.removeAtDownvotes}
            <input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => onThresholdChange(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
            />
          </label>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
          {t.settings.queueLimits}
        </h3>
        <label className="block text-sm text-white/70">
          {t.settings.cooldownLabel}
          <input
            type="number"
            min={0}
            max={1440}
            value={trackCooldownMinutes}
            onChange={(e) => onTrackCooldownChange(e.target.value)}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
          />
          <span className="mt-1 block text-xs text-white/45">
            {t.settings.cooldownHint}
          </span>
        </label>
        <label className="mt-4 block text-sm text-white/70">
          {t.settings.maxRequestsLabel}
          <input
            type="number"
            min={0}
            max={50}
            value={maxActiveRequestsPerGuest}
            onChange={(e) => onMaxRequestsChange(e.target.value)}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
          />
          <span className="mt-1 block text-xs text-white/45">
            {t.settings.maxRequestsHint}
          </span>
        </label>
      </section>
    </>
  );
}
