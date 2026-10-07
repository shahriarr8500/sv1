import { Component, type ReactNode } from "react";

interface StudentOSTargetsErrorBoundaryProps {
  children: ReactNode;
}

export class StudentOSTargetsErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as null | Error };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[StudentOS:Targets] Target/Performance render error:", error, info);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="text-sm font-semibold tracking-tight text-destructive">
            Targets feature unavailable
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The plan and performance panels hit a runtime error. The rest of Student
            OS is still usable.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto text-left text-[11px] leading-5 text-muted-foreground/80 rounded border border-border/60 p-2">
            {this.state.error.stack}
          </pre>
        </section>
      );
    }

    return this.props.children;
  }
}

export const StudentOSTargetsErrorFallback = ({ error }: { error: Error }) => (
  <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
    <h2 className="text-sm font-semibold tracking-tight text-destructive">
      Targets feature unavailable
    </h2>
    <p className="mt-1 text-sm text-muted-foreground">
      The plan and performance panels hit a runtime error. The rest of Student OS is still usable.
    </p>
    <pre className="mt-3 max-h-40 overflow-auto text-left text-[11px] leading-5 text-muted-foreground/80 rounded border border-border/60 p-2">
      {error.stack}
    </pre>
  </section>
);
