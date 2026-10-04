import { useAuth } from "@/hooks/use-auth";

/** Display label for the signed-in account (email, name, or guest fallback). */
export function useAccountLabel(): string {
  const { user } = useAuth();
  return user?.email ?? user?.name ?? "Guest student";
}
