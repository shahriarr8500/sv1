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
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

/**
 * Admin entry gate. The pass is checked by `admin.verifyAdminPass` on the
 * server, which is the only thing that grants the console access — the pass
 * itself is never trusted by, or stored in, the browser.
 */
export default function AdminEntry() {
  const { user } = useAuth();
  const verifyAdminPass = useMutation(api.admin.verifyAdminPass);
  const navigate = useNavigate();
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyAdminPass({ pass });
      navigate("/admin-console", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "That admin pass isn't right.",
      );
      setPass("");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <div className="mb-4 mt-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="size-5 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Admin entry</CardTitle>
          <CardDescription>
            Enter the admin pass to open the account console
            {user?.email ? ` for ${user.email}` : ""}.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-2">
            <Input
              name="adminPass"
              type="password"
              value={pass}
              onChange={(event) => setPass(event.target.value)}
              placeholder="Admin pass"
              autoComplete="off"
              autoFocus
              disabled={isSubmitting}
            />
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
                  Verifying...
                </>
              ) : (
                <>
                  Open admin console
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link to="/access-pass">
                <ArrowLeft className="mr-2 size-4" />
                Back to access pass
              </Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}