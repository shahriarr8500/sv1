import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

/**
 * Admin impersonation state.
 *
 * `session` is the live answer from the server, so nothing about an
 * impersonation is trusted from local storage. A non-admin, or an admin with no
 * open session, sees `{ active: false }`.
 */
export function useImpersonation() {
  const session = useQuery(api.impersonation.active);
  const startImpersonating = useMutation(api.impersonation.start);
  const stopImpersonating = useMutation(api.impersonation.stop);

  /** Opens a session and reports whether it worked. */
  const impersonate = async (targetUserId: Id<"users">) => {
    try {
      await startImpersonating({ targetUserId });
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open that session",
      );
      return false;
    }
  };

  /** Closes the current session. */
  const endImpersonation = async () => {
    try {
      await stopImpersonating();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not stop the session",
      );
      return false;
    }
  };

  return {
    isImpersonating: session?.active === true,
    target: session?.active ? session.target : null,
    startedAt: session?.active ? session.startedAt : null,
    impersonate,
    endImpersonation,
  };
}