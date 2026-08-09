"use client";

import { getClientAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

export function useGuestAuth() {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!configured);
  const [error, setError] = useState<string | null>(
    configured ? null : "Firebase is not configured",
  );

  useEffect(() => {
    if (!configured) return;

    const auth = getClientAuth();
    const unsub = onAuthStateChanged(auth, async (next) => {
      if (next) {
        setUser(next);
        setReady(true);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        setUser(cred.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Auth failed");
      } finally {
        setReady(true);
      }
    });
    return () => unsub();
  }, [configured]);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }, [user]);

  return { user, ready, error, getIdToken };
}
