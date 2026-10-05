import { useAccessPass } from "@/hooks/use-access-pass";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Wraps a signed-in route that additionally requires the access pass.
 *
 * Nested inside `RequireAuth`, so signed-out visitors still get sent to
 * `/auth` first. Visitors without the pass are sent to `/access-pass` and
 * returned to the page they asked for once they enter it.
 */
export function RequireAccessPass({ children }: { children: ReactNode }) {
  const { hasPass } = useAccessPass();
  const location = useLocation();

  if (!hasPass) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/access-pass?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return children;
}