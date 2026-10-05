import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  // Convex Auth validates the session token by signature only, so a deleted
  // account keeps a valid token until it expires and would otherwise look
  // signed in. Requiring the user document to still exist means an admin
  // delete takes effect on the very next load instead of up to an hour later.
  const isAuthenticated = isConvexAuthenticated && user !== null;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
