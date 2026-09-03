import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level safety net: if ANY component throws during render, show a readable
 * recovery screen instead of a blank/black page. Inline styles are used on
 * purpose so the fallback renders even if the stylesheet failed to load.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the real error visible in the console for debugging.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#070b14",
            color: "#e5eaf3",
            fontFamily: "system-ui, sans-serif",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: "100%",
              border: "1px solid #2a3550",
              borderRadius: 14,
              padding: "1.5rem",
              background: "#0d1626",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#f87171",
              }}
            >
              Something went wrong
            </h1>
            <p style={{ marginTop: "0.6rem", fontSize: "0.9rem", lineHeight: 1.5, opacity: 0.85 }}>
              The page hit an unexpected error. Your data is safe — try reopening the page.
            </p>
            <p
              style={{
                marginTop: "0.6rem",
                fontSize: "0.78rem",
                fontFamily: "monospace",
                color: "#93a4c3",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.message}
            </p>
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                onClick={() => this.setState({ error: null })}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: 8,
                  border: "1px solid #2a3550",
                  background: "transparent",
                  color: "#e5eaf3",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  this.setState({ error: null });
                  window.location.assign("/");
                }}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: 8,
                  border: "none",
                  background: "#86efac",
                  color: "#052e16",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
