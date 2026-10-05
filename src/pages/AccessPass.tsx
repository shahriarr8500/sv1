import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import logo from "@/assets/logo.svg";
import { useAccessPass } from "@/hooks/use-access-pass";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, KeyRound, Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";

/**
 * Post-sign-in gate. Signed-in visitors land here first and must enter the
 * access pass before any part of the app loads. The pass is remembered in
 * localStorage, and signing out clears it.
 */
export default function AccessPass() {
  const { isLoading: authLoading, user, signOut } = useAuth();
  const { hasPass, submitPass } = useAccessPass();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnTo = searchParams.get("returnTo") ?? "/dashboard";
  const next =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/dashboard";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!submitPass(pass)) {
      setError("That pass isn't right. Try again.");
      setPass("");
      return;
    }
    setIsSubmitting(true);
    navigate(next, { replace: true });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/", { replace: true });
    }
  };

  // Already unlocked in this browser — no reason to ask again.
  if (hasPass) return <Navigate to={next} replace />;

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-md">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <img
              src={logo}
              alt="Student OS V1"
              width={56}
              height={56}
              className="mb-4 mt-2 cursor-pointer rounded-lg"
              onClick={() => navigate("/")}
            />
          </div>
          <CardTitle className="text-xl">Enter your access pass</CardTitle>
          <CardDescription>
            {user?.email
              ? `Signed in as ${user.email}. Enter the access pass to open Student OS V1.`
              : "Enter the access pass to open Student OS V1."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-2">
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                name="pass"
                value={pass}
                onChange={(event) => setPass(event.target.value)}
                placeholder="Access pass"
                autoComplete="off"
                autoFocus
                disabled={isSubmitting}
                className="pl-9 tracking-[0.4em] uppercase"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || pass.trim().length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Unlocking...
                </>
              ) : (
                <>
                  Unlock Student OS
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleSignOut}
              disabled={isSubmitting}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}