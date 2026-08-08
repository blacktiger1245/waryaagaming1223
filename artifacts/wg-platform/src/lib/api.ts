/**
 * Build API URLs for both Replit's same-origin `/api` routing and deployments
 * where the frontend and API are hosted at different origins.
 *
 * VITE_API_URL should be the API origin (for example, https://api.example.com).
 * The API path remains `/api/...` so the default Replit routing needs no setup.
 */
const configuredApiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, "");
const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${configuredApiOrigin ?? appBasePath}${normalizedPath}`;
}

export function storageUrl(objectPath: string | null | undefined): string | undefined {
  if (!objectPath) return undefined;
  if (/^https?:\/\//i.test(objectPath)) return objectPath;
  return apiUrl(`/api/storage${objectPath.startsWith("/") ? objectPath : `/${objectPath}`}`);
}