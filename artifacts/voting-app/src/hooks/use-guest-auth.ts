import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "pulsevote_guest_id";
const GUEST_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateGuestId(): string {
  let suffix = "";
  for (let i = 0; i < 10; i++) {
    suffix += GUEST_ID_CHARS[Math.floor(Math.random() * GUEST_ID_CHARS.length)];
  }
  return `user_demo_${suffix}`;
}

export function useGuestAuth() {
  const [guestId, setGuestId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setGuestId(stored);
    }
  }, []);

  const signInAsGuest = useCallback(() => {
    const id = generateGuestId();
    localStorage.setItem(STORAGE_KEY, id);
    setGuestId(id);
    return id;
  }, []);

  const signOutGuest = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setGuestId(null);
  }, []);

  return { guestId, isGuest: !!guestId, signInAsGuest, signOutGuest };
}
