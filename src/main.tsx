import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAccessPass } from "@/components/RequireAccessPass";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/student-os/AppShell";
import { StudentOSProvider } from "@/state/student-os";
import { AshyProgressStatsSync } from "@/components/ashy/ProgressStatsSync";
import { WorkspaceProvider } from "@/state/workspace";
import { StudyLogProvider } from "@/state/study-log";
import { TargetsProvider } from "@/state/targets";
import { GamificationProvider } from "@/state/gamification";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing"));
const AuthPage = lazy(() => import("./pages/Auth"));
const AccessPass = lazy(() => import("./pages/AccessPass"));
const AdminEntry = lazy(() => import("./pages/AdminEntry"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Missions = lazy(() => import("./pages/Missions"));
const SyllabusIndex = lazy(() => import("./pages/Syllabus"));
const QuranPage = lazy(() => import("./pages/Quran"));
const Ashy = lazy(() => import("./pages/Ashy"));
const Subject = lazy(() => import("./pages/Subject"));
const Chapter = lazy(() => import("./pages/Chapter"));
const Goal = lazy(() => import("./pages/Goal"));
const Settings = lazy(() => import("./pages/Settings"));
const Catalog = lazy(() => import("./pages/Catalog"));
const CatalogNew = lazy(() => import("./pages/CatalogNew"));
const CatalogItem = lazy(() => import("./pages/CatalogItem"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Admin = lazy(() => import("./pages/Admin"));
const StudyTimer = lazy(() => import("./pages/StudyTimer"));
const Performance = lazy(() => import("./pages/Performance"));
// Unlinked sandbox for trying new UI without touching the app.
const Labs = lazy(() => import("./labs/Labs"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Quiet loading state for route transitions — a spinner, never a flash of text.
function RouteLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2
        className="size-5 animate-spin text-muted-foreground"
        aria-label="Loading"
      />
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
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <StudentOSProvider>
            <WorkspaceProvider>
              <StudyLogProvider>
                <TargetsProvider>
                  <GamificationProvider>
                    <BrowserRouter>
                      <RouteSyncer />
                      {/* Headless: mirrors study time + streak for Ashy. */}
                      <AshyProgressStatsSync />
                      <Suspense fallback={<RouteLoading />}>
                        <Routes>
                          <Route path="/" element={<Landing />} />
                          <Route
                            path="/auth"
                            element={
                              <AuthPage />
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
                            path="/*"
                            element={
                              <RequireAuth
                                title="Sign in to open Student OS V1"
                                description="Your dashboard, syllabus, and progress live behind sign-in."
                              >
                                <RequireAccessPass>
                                  <StudentOSApp />
                                </RequireAccessPass>
                              </RequireAuth>
                            }
                          />
                          {/* Sandbox: not linked from any nav, public so an experiment can
                              be previewed without signing in. */}
                          <Route path="/labs" element={<Labs />} />
                          <Route path="/labs/:feature" element={<Labs />} />
                        </Routes>
                      </Suspense>
                    </BrowserRouter>
                    <Toaster />
                  </GamificationProvider>
                </TargetsProvider>
              </StudyLogProvider>
            </WorkspaceProvider>
          </StudentOSProvider>
        </ThemeProvider>
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);

/** Single mounted shell for every signed-in Student OS route. The Quran player,
 *  timer widget and toaster live outside the router `<Outlet />` so route
 *  changes never unmount them. */
export function StudentOSApp() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/missions" element={<Missions />} />
          <Route path="/syllabus" element={<SyllabusIndex />} />
          <Route path="/quran" element={<QuranPage />} />
          <Route path="/ashy" element={<Ashy />} />
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
          <Route path="/performance" element={<Performance />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
