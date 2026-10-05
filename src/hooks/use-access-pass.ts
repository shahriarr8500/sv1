import { useCallback, useState } from "react";

/** Key under which an unlocked access pass is remembered in localStorage. */
const STORAGE_KEY = "student-os:access-pass";
/** The pass that opens the app. */
const ACCESS_PASS = "UGAY";

function readStoredPass(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === ACCESS_PASS;
  } catch {
    // Private mode / storage disabled — treat as locked rather than crashing.
    return false;
  }
}

/** Forgets the pass without touching React state (e.g. on sign-out). */
export function clearStoredAccessPass() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** Access-pass state for the gate page and the route guard. */
export function useAccessPass() {
  const [hasPass, setHasPass] = useState(readStoredPass);

  /** Returns true only when `value` is the access pass; stores it on success. */
  const submitPass = useCallback((value: string) => {
    if (value.trim().toUpperCase() !== ACCESS_PASS) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, ACCESS_PASS);
    } catch {
      // Still unlock for this session even if persistence fails.
    }
    setHasPass(true);
    return true;
  }, []);

  const clearPass = useCallback(() => {
    clearStoredAccessPass();
    setHasPass(false);
  }, []);

  return { hasPass, submitPass, clearPass };
}