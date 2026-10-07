import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAccessPass } from "@/components/RequireAccessPass";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/student-os/AppShell";
import { StudentOSProvider } from "@/state/student-os";
import { WorkspaceProvider } from "@/state/workspace";
import { StudyLogProvider } from "@/state/study-log";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const AccessPass = lazy(() => import("./pages/AccessPass.tsx"));
const AdminEntry = lazy(() => import("./pages/AdminEntry.tsx"));
const AdminConsole = lazy(() => import("./pages/AdminConsole.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Subject = lazy(() => import("./pages/Subject.tsx"));
const Chapter = lazy(() => import("./pages/Chapter.tsx"));
const Goal = lazy(() => import("./pages/Goal.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Catalog = lazy(() => import("./pages/Catalog.tsx"));
const CatalogNew = lazy(() => import("./pages/CatalogNew.tsx"));
const CatalogItem = lazy(() => import("./pages/CatalogItem.tsx"));
const Checkout = lazy(() => import("./pages/Checkout.tsx"));
const Bookings = lazy(() => import("./pages/Bookings.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const StudyTimer = lazy(() => import("./pages/StudyTimer.tsx"));
// Unlinked sandbox for trying new UI without touching the app.
const Labs = lazy(() => import("./labs/Labs.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(error: Error) {
    console.error("[Preview] Root crash:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
        >
        <StudentOSProvider>
          <WorkspaceProvider>
            <StudyLogProvider>
          <BrowserRouter>
            <RouteSyncer />
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route
                  path="/auth"
                  element={
                    <AuthPage redirectAfterAuth="/dashboard" />
                  }
                />
                <Route
                  path="/access-pass"
                  element={
                    <RequireAuth
                      title="Sign in to unlock Student OS V1"
                      description="The access pass is checked after you sign in."
                      redirectImmediately
                    >
                      <AccessPass />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/admin-entry"
                  element={
                    <RequireAuth
                      title="Sign in to use the admin entry"
                      description="The admin console is only available to signed-in users."
                      redirectImmediately
                    >
                      <RequireAccessPass>
                        <AdminEntry />
                      </RequireAccessPass>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/admin-console"
                  element={
                    <RequireAuth
                      title="Sign in to open the admin console"
                      description="Account management is only available to signed-in users."
                      redirectImmediately
                    >
                      <RequireAccessPass>
                        <AdminConsole />
                      </RequireAccessPass>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/onboarding"
                  element={
                    <RequireAuth
                      title="Sign in to set up Student OS V1"
                      description="Your goal and syllabus progress are tied to your account."
                    >
                      <RequireAccessPass>
                        <Onboarding />
                      </RequireAccessPass>
                    </RequireAuth>
                  }
                />
                <Route
                  element={
                    <RequireAuth
                      title="Sign in to open Student OS V1"
                      description="Your dashboard, syllabus, and progress live behind sign-in."
                    >
                      <RequireAccessPass>
                        <AppShell />
                      </RequireAccessPass>
                    </RequireAuth>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/syllabus/:subjectId" element={<Subject />} />
                  <Route
                    path="/syllabus/:subjectId/:chapterId"
                    element={<Chapter />}
                  />
                  <Route path="/goal" element={<Goal />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/catalog" element={<Catalog />} />
                  <Route path="/catalog/new" element={<CatalogNew />} />
                  <Route path="/catalog/:itemId" element={<CatalogItem />} />
                  <Route path="/book/:itemId" element={<Checkout />} />
                  <Route path="/bookings" element={<Bookings />} />
                  <Route path="/timer" element={<StudyTimer />} />
                  <Route path="/admin" element={<Admin />} />
                </Route>
                {/* Sandbox: not linked from any nav, public so an experiment can
                    be previewed without signing in. */}
                <Route path="/labs" element={<Labs />} />
                <Route path="/labs/:feature" element={<Labs />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
            </StudyLogProvider>
          </WorkspaceProvider>
        </StudentOSProvider>
        </ThemeProvider>
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
