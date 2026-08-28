import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
    discordId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    isAdmin: boolean;
    adminUsername: string;
    oauthState: string;
    oauthApp?: boolean;
  }
}
