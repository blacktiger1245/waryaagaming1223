import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
  copied: boolean;
}

/**
 * The JavaScript bundle the page is actually running, e.g.
 * "/assets/index-g3lDa_mH.js". Shown on the fallback so every report tells us
 * which build produced it — a stale cached bundle is otherwise indistinguishable
 * from a real bug.
 */
function currentBuildId(): string {
  try {
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    return (
      scripts
        .map((s) => s.getAttribute("src") ?? "")
        .find((src) => /assets\/index-.*\.js/.test(src)) ?? "unknown"
    );
  } catch {
    return "unknown";
  }
}

/**
 * Top-level safety net: if ANY component throws during render, show a readable
 * recovery screen instead of a blank/black page. Inline styles are used on
 * purpose so the fallback renders even if the stylesheet failed to load.
 *
 * The screen also reports the build id and the React component stack (with a
 * copy button), so an unhandled render error — e.g. React error #310, "Rendered
 * more hooks than during the previous render" — names the exact component that
 * crashed instead of only reaching the browser console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, copied: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, componentStack: null, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the real error visible in the console for debugging.
    console.error("Unhandled render error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  /** Everything needed to identify the crash, as plain text. */
  private report(): string {
    const { error, componentStack } = this.state;
    return [
      `message: ${error?.message ?? "unknown"}`,
      `build: ${currentBuildId()}`,
      `url: ${typeof window !== "undefined" ? window.location.href : ""}`,
      `user agent: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
      "component stack:",
      (componentStack ?? "(not available)").trim(),
    ].join("\n");
  }

  private copyReport = async () => {
    try {
      await navigator.clipboard.writeText(this.report());
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the stack is
      // already on screen and in the console.
    }
  };

  render() {
    if (this.state.error) {
      const { componentStack, copied } = this.state;
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
            <p style={{ marginTop: "0.5rem", fontSize: "0.7rem", fontFamily: "monospace", color: "#5f7292" }}>
              build {currentBuildId()}
            </p>

            {componentStack && (
              <details style={{ marginTop: "0.75rem" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#93a4c3",
                  }}
                >
                  Technical details
                </summary>
                <pre
                  style={{
                    marginTop: "0.5rem",
                    maxHeight: 200,
                    overflow: "auto",
                    padding: "0.6rem",
                    borderRadius: 8,
                    border: "1px solid #2a3550",
                    background: "#070b14",
                    fontSize: "0.68rem",
                    lineHeight: 1.45,
                    color: "#93a4c3",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {componentStack.trim()}
                </pre>
              </details>
            )}

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
              <button
                onClick={this.copyReport}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: 8,
                  border: "1px solid #2a3550",
                  background: "transparent",
                  color: copied ? "#86efac" : "#e5eaf3",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied" : "Copy details"}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
