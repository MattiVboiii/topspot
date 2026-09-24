"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const AUTO_LINK_KEY = "topspot_auto_link_device";
const SILENT_LINK_COOLDOWN_MS = 45_000;
const DEVICE_POLL_MS = 60_000;

type Options = {
  partyId: string;
  browserDeviceId: string | null;
  playerReady: boolean;
  playerStatus: string;
  sdkActiveDevice: boolean;
  isController: boolean;
  partyIsPaused: boolean;
  nowPlayingId: string | null;
  deviceNameFallback: string;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
};

export function useSpotifyDeviceLink({
  partyId,
  browserDeviceId,
  playerReady,
  playerStatus,
  sdkActiveDevice,
  isController,
  partyIsPaused,
  nowPlayingId,
  deviceNameFallback,
  setBusy,
  setActionError,
}: Options) {
  const [deviceLinked, setDeviceLinked] = useState<boolean | null>(null);
  const [activeDeviceName, setActiveDeviceName] = useState<string | null>(null);
  const [deviceCheckBusy, setDeviceCheckBusy] = useState(false);
  const [autoLink, setAutoLink] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(AUTO_LINK_KEY) === "1";
    } catch {
      return false;
    }
  });

  const linkingRef = useRef(false);
  const autoLinkRef = useRef(false);
  const sdkActiveDeviceRef = useRef(false);
  const partyPausedRef = useRef(true);
  const lastSilentLinkAtRef = useRef(0);
  const deviceNameRef = useRef(deviceNameFallback);
  const linkBrowserDeviceRef = useRef<
    (opts?: { silent?: boolean }) => Promise<void>
  >(async () => {});

  useEffect(() => {
    autoLinkRef.current = autoLink;
  }, [autoLink]);

  useEffect(() => {
    sdkActiveDeviceRef.current = sdkActiveDevice;
  }, [sdkActiveDevice]);

  useEffect(() => {
    deviceNameRef.current = deviceNameFallback;
  }, [deviceNameFallback]);

  useEffect(() => {
    partyPausedRef.current = partyIsPaused;
  }, [partyIsPaused]);

  const trySilentAutoLink = useCallback(() => {
    if (!autoLinkRef.current || partyPausedRef.current || linkingRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastSilentLinkAtRef.current < SILENT_LINK_COOLDOWN_MS) return;
    lastSilentLinkAtRef.current = now;
    void linkBrowserDeviceRef.current({ silent: true });
  }, []);

  const checkDeviceLink = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (!browserDeviceId) {
        setDeviceLinked(null);
        setActiveDeviceName(null);
        return;
      }
      if (sdkActiveDeviceRef.current && !opts?.manual) {
        setDeviceLinked(true);
        setActiveDeviceName((prev) => prev ?? deviceNameRef.current);
        return;
      }
      if (opts?.manual) {
        setDeviceCheckBusy(true);
        setActionError(null);
      }
      try {
        const res = await fetch(`/api/parties/${partyId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "device-status",
            deviceId: browserDeviceId,
          }),
        });
        const data = (await res.json()) as {
          linked?: boolean;
          activeDeviceName?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not check device");
        const linked = Boolean(data.linked) || sdkActiveDeviceRef.current;
        setDeviceLinked(linked);
        setActiveDeviceName(
          linked
            ? (data.activeDeviceName ?? deviceNameRef.current)
            : (data.activeDeviceName ?? null),
        );

        if (!linked) trySilentAutoLink();
      } catch (err) {
        if (opts?.manual) {
          setActionError(
            err instanceof Error ? err.message : "Could not check device",
          );
        }
      } finally {
        if (opts?.manual) setDeviceCheckBusy(false);
      }
    },
    [browserDeviceId, partyId, setActionError, trySilentAutoLink],
  );

  const linkBrowserDevice = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!browserDeviceId || linkingRef.current) return;
      linkingRef.current = true;
      if (!opts?.silent) {
        setBusy(true);
        setActionError(null);
      }
      try {
        const res = await fetch(`/api/parties/${partyId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "link-device",
            deviceId: browserDeviceId,
          }),
        });
        const data = (await res.json()) as {
          linked?: boolean;
          pending?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not link browser");
        if (data.linked) {
          setDeviceLinked(true);
          setActiveDeviceName(deviceNameRef.current);
        } else if (!opts?.silent) {
          setDeviceLinked(false);
        }
        if (!opts?.silent && data.linked) {
          await checkDeviceLink({ manual: true });
        }
      } catch (err) {
        if (!opts?.silent) {
          setActionError(
            err instanceof Error ? err.message : "Could not link browser",
          );
        }
      } finally {
        linkingRef.current = false;
        if (!opts?.silent) setBusy(false);
      }
    },
    [browserDeviceId, partyId, checkDeviceLink, setBusy, setActionError],
  );

  useEffect(() => {
    linkBrowserDeviceRef.current = linkBrowserDevice;
  }, [linkBrowserDevice]);

  const canControlDevice =
    playerReady && Boolean(browserDeviceId) && isController;
  const deviceLinkedForUi = canControlDevice
    ? deviceLinked === true || sdkActiveDevice
      ? true
      : deviceLinked
    : null;
  const activeDeviceNameForUi = canControlDevice
    ? deviceLinkedForUi
      ? (activeDeviceName ?? deviceNameFallback)
      : activeDeviceName
    : null;

  const playerConnecting =
    !playerReady ||
    playerStatus === "connecting" ||
    playerStatus === "loading_sdk";
  const [linkGate, setLinkGate] = useState({
    connecting: playerConnecting,
    controlling: canControlDevice,
  });
  if (
    linkGate.connecting !== playerConnecting ||
    linkGate.controlling !== canControlDevice
  ) {
    const gainedControl =
      canControlDevice && !linkGate.controlling && !playerConnecting;
    setLinkGate({
      connecting: playerConnecting,
      controlling: canControlDevice,
    });
    if (playerConnecting || gainedControl) {
      setDeviceLinked(null);
      setActiveDeviceName(null);
    }
  }

  function onAutoLinkChange(enabled: boolean) {
    setAutoLink(enabled);
    autoLinkRef.current = enabled;
    try {
      window.localStorage.setItem(AUTO_LINK_KEY, enabled ? "1" : "0");
    } catch {
      // ignore
    }
    if (enabled && deviceLinked === false && !partyPausedRef.current) {
      trySilentAutoLink();
    }
  }

  useEffect(() => {
    if (!canControlDevice) return;
    const kickoff = window.setTimeout(() => {
      void checkDeviceLink();
    }, 1_500);
    const id = window.setInterval(() => void checkDeviceLink(), DEVICE_POLL_MS);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [canControlDevice, checkDeviceLink]);

  useEffect(() => {
    if (!autoLink || !canControlDevice) return;
    if (partyIsPaused || !nowPlayingId) return;
    if (deviceLinked !== false) return;
    const timer = window.setTimeout(() => {
      trySilentAutoLink();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    autoLink,
    canControlDevice,
    partyIsPaused,
    nowPlayingId,
    deviceLinked,
    trySilentAutoLink,
  ]);

  return {
    autoLink,
    deviceCheckBusy,
    deviceLinkedForUi,
    activeDeviceNameForUi,
    checkDeviceLink,
    linkBrowserDevice,
    onAutoLinkChange,
  };
}
