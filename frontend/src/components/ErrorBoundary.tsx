import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches render-time errors anywhere in the tree and shows a recoverable
 * fallback instead of a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "32px 28px",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            Something went wrong
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.6,
              marginBottom: 22,
            }}
          >
            The page hit an unexpected error. Reloading usually fixes it.
          </div>
          {import.meta.env.DEV && this.state.message && (
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                color: "var(--neg)",
                background: "var(--bg3)",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 22,
                wordBreak: "break-word",
                textAlign: "left",
              }}
            >
              {this.state.message}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "var(--accent)",
              color: "#000",
              border: "none",
              borderRadius: 10,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              padding: "12px 28px",
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
