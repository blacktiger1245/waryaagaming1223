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
  if (/^(?:https?:|data:|blob:)/i.test(objectPath)) return objectPath;
  // Some older registrations stored the API path instead of the raw
  // object-storage path. Do not prefix those paths a second time.
  if (objectPath.startsWith("/api/storage/") || objectPath === "/api/storage") {
    return apiUrl(objectPath);
  }
  return apiUrl(`/api/storage${objectPath.startsWith("/") ? objectPath : `/${objectPath}`}`);
}

export async function uploadTeamLogo(file: File): Promise<string> {
  const response = await fetch(apiUrl("/api/storage/uploads/team-logo/direct"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Failed to upload team logo");
  if (typeof data.objectPath !== "string" || !data.objectPath) {
    throw new Error("The logo upload did not return a file path");
  }
  return data.objectPath;
}