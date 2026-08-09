"use client";

import { getClientAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";

export function useGuestAuth() {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!configured);
  const [error, setError] = useState<string | null>(
    configured ? null : "Firebase is not configured",
  );
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    if (!configured) return;

    const auth = getClientAuth();
    const unsub = onAuthStateChanged(auth, async (next) => {
      if (next) {
        userRef.current = next;
        setUser(next);
        setReady(true);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        userRef.current = cred.user;
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
    const current = userRef.current;
    if (!current) throw new Error("Not authenticated");
    return current.getIdToken();
  }, []);

  return { user, ready, error, getIdToken };
}
