import { clearStoredAccessPass } from "@/hooks/use-access-pass";
import { useAuth } from "@/hooks/use-auth";
import { useCallback } from "react";
import { useNavigate } from "react-router";

/** Shared sign-out behavior for the sidebar footer and Settings. */
export function useSignOut() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      await signOut();
    } finally {
      // Signing out also revokes the access pass on this browser.
      clearStoredAccessPass();
      navigate("/");
    }
  }, [signOut, navigate]);
}
