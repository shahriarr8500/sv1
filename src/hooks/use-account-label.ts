import { useImpersonation } from "@/hooks/use-impersonation";
import { useAuth } from "@/hooks/use-auth";

/**
 * Display label for the signed-in account (email, name, or guest fallback).
 *
 * While an admin is impersonating somebody else the label names *that*
 * account, so the sidebar doesn't claim you are still yourself.
 */
export function useAccountLabel(): string {
  const { user } = useAuth();
  const { isImpersonating, target } = useImpersonation();

  if (isImpersonating && target) {
    return target.name ?? target.email ?? "Impersonated account";
  }
  return user?.email ?? user?.name ?? "Guest student";
}