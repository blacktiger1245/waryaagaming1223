import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/error-boundary";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

const configuredApiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
if (configuredApiOrigin) {
  setBaseUrl(configuredApiOrigin);
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
