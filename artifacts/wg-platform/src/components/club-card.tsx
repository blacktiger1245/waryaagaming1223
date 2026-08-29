import { useRef, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storageUrl } from "@/lib/api";
import { countryNameToFlagUrl } from "@/lib/countries";

// Fixed export dimensions (4:5 portrait, social-media ready)
const CARD_W = 1080;
const CARD_H = 1350;

export interface ClubCardStats {
  members: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

interface ClubCardProps {
  team: any;
  stats: ClubCardStats;
}

function sanitizeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_") || "club"
  );
}

const sectionLabel: React.CSSProperties = { fontSize: 17, fontWeight: 800, letterSpacing: 4, color: "#00A8FF" };
const sectionRule: React.CSSProperties = { flex: 1, height: 1, background: "linear-gradient(90deg, rgba(0,168,255,0.6), transparent)" };
const panelBg: React.CSSProperties = { background: "#0B1626", border: "1px solid rgba(0,168,255,0.25)", borderRadius: 16 };
const cellLabel: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 2 };

function StatCell({ label, value, accent = "#FFFFFF" }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: "#0B1626", border: "1px solid rgba(0,168,255,0.18)", borderRadius: 14, padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" }}>{label}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
      <div style={sectionLabel}>{title}</div>
      <div style={sectionRule} />
    </div>
  );
}

function MemberAvatar({ name, avatarUrl, size = 76 }: { name: string; avatarUrl?: string | null; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        border: "3px solid rgba(0,168,255,0.5)",
        background: "#101E32",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontSize: size * 0.4, fontWeight: 900, color: "#00A8FF" }}>{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}


export default function ClubCard({ team, stats }: ClubCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const name: string = team.name ?? "Club";
  const tag: string | null = team.tag ?? null;
  const logo = storageUrl(team.logoUrl);
  const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  const ranking = team.points != null ? `#${Math.max(1, Math.round(100 - team.points))}` : "—";
  const founded = team.createdAt
    ? new Date(team.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  // Club country is derived from the president's country, then captain, then any member.
  const members: any[] = team.members ?? [];
  const country: string | null =
    members.find((m: any) => m.id === team.presidentId)?.country ??
    members.find((m: any) => m.id === team.captainId)?.country ??
    members.find((m: any) => m.country)?.country ??
    null;
  const flagSrc = countryNameToFlagUrl(country ?? "", "w160");

  // Leadership — dynamic, never hardcoded.
  const president = team.president ?? null;
  const captain = team.captain ?? null;

  // Squad players (president, coach, captain first) — max 10 for layout.
  const squad = [...members]
    .sort((a: any, b: any) => {
      const rank = (m: any) => (m.id === team.presidentId ? 0 : m.id === team.coachId ? 1 : m.id === team.captainId ? 2 : 3);
      return rank(a) - rank(b);
    })
    .slice(0, 10);

  // Transfer history — real data, fetched fresh for the card.
  const { data: transfers = [], isLoading: transfersLoading } = useQuery<any[]>({
    queryKey: ["team-transfers", team.id],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${team.id}/transfers`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const recentTransfers = (transfers as any[]).slice(0, 3);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Responsive preview scaling (export stays at full 1080x1350)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / CARD_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // PNG export (html-to-image, 2x pixel ratio for sharp output)
  const handleDownload = useCallback(async () => {
    const node = cardRef.current;
    if (!node || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: "#050A12",
        width: CARD_W,
        height: CARD_H,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${sanitizeFilename(name)}-club-card.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Club card export failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [name, downloading]);

  const logoSrc = `${import.meta.env.BASE_URL}waryaalogo-removebg-preview.png`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-lg">Official Club Card</h3>
          <p className="text-sm text-muted-foreground">Premium 1080 x 1350 export — share on socials or Discord.</p>
        </div>
        <Button onClick={handleDownload} disabled={downloading} className="gap-2 font-bold">
          <Download className="w-4 h-4" />
          {downloading ? "Generating…" : "Download Club Card"}
        </Button>

      {/* Responsive preview container — card scales down, export stays full-size */}
      <div ref={wrapRef} className="w-full overflow-hidden" style={{ height: CARD_H * scale }}>
        <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {/* The card itself (exported node) */}
          <div
            ref={cardRef}
            style={{
              width: CARD_W,
              height: CARD_H,
              position: "relative",
              overflow: "hidden",
              background: "linear-gradient(160deg, #07111F 0%, #050A12 55%, #07111F 100%)",
              border: "3px solid rgba(0,168,255,0.45)",
              borderRadius: 32,
              boxShadow: "0 0 60px rgba(0,168,255,0.25), inset 0 0 120px rgba(0,102,255,0.08)",
              display: "flex",
              flexDirection: "column",
              fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
              color: "#FFFFFF",
              padding: 44,
              boxSizing: "border-box",
            }}
          >
            {/* decorative glows */}
            <div style={{ position: "absolute", top: -140, left: -120, width: 460, height: 460, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,168,255,0.22) 0%, transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -160, right: -120, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,102,255,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />

            {/* Top bar: WG logo (forced white) + official badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
              <img
                src={logoSrc}
                alt="Waryaa Gaming"
                // brightness(0) + invert(1) forces the visible logo pure white, transparency preserved
                style={{ height: 60, filter: "brightness(0) saturate(100%) invert(1)", opacity: 0.95 }}
              />
              <div style={{ border: "1.5px solid rgba(245,197,66,0.5)", borderRadius: 999, padding: "8px 22px", fontSize: 15, fontWeight: 800, letterSpacing: 3, color: "#F5C542", background: "rgba(245,197,66,0.08)" }}>
                OFFICIAL CLUB CARD
              </div>
            </div>

            {/* Club logo with premium gradient frame + glow */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 30, position: "relative" }}>
              <div style={{ width: 240, height: 240, borderRadius: "50%", padding: 6, background: "linear-gradient(135deg, #00A8FF 0%, #0066FF 50%, #F5C542 100%)", boxShadow: "0 0 70px rgba(0,168,255,0.55)" }}>
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: "5px solid #07111F", background: "#0B1626", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {logo ? (
                    <img src={logo} alt={name} crossOrigin="anonymous" style={{ maxWidth: "72%", maxHeight: "72%", objectFit: "contain" }} />
                  ) : (
                    <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="#00A8FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>

      </div>


            {/* Name + tag + country */}
            <div style={{ textAlign: "center", marginTop: 24, position: "relative" }}>
              <h1 style={{ fontSize: 52, fontWeight: 900, margin: 0, lineHeight: 1.05, color: "#FFFFFF" }}>
                {name}
                {tag && <span style={{ fontSize: 30, fontWeight: 700, color: "#00A8FF", marginLeft: 10 }}>({tag})</span>}
              </h1>
              {country && (
                <div style={{ marginTop: 10, fontSize: 22, fontWeight: 700, color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {flagSrc && <img src={flagSrc} alt={country} crossOrigin="anonymous" style={{ width: 42, height: 29, objectFit: "cover", borderRadius: 4, border: "1px solid rgba(148,163,184,0.4)" }} />}
                  {country}
                </div>
              )}
            </div>

            {/* Ranking / Players / Founded strip */}
            <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, position: "relative" }}>
              <div style={{ ...panelBg, border: "1px solid rgba(245,197,66,0.4)", padding: "16px 20px", textAlign: "center" }}>
                <div style={cellLabel}>Ranking</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#F5C542", lineHeight: 1.15 }}>{ranking}</div>
              </div>
              <div style={{ ...panelBg, padding: "16px 20px", textAlign: "center" }}>
                <div style={cellLabel}>Total Players</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#00A8FF", lineHeight: 1.15 }}>{stats.members}</div>
              </div>
              <div style={{ ...panelBg, padding: "16px 20px", textAlign: "center" }}>
                <div style={cellLabel}>Founded</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.4 }}>{founded}</div>
              </div>
            </div>

            {/* Club status — live match statistics */}
            <div style={{ marginTop: 24, position: "relative" }}>
              <SectionHeader title="CLUB STATUS" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                <StatCell label="Members" value={stats.members} accent="#00A8FF" />
                <StatCell label="Matches" value={stats.played} />
                <StatCell label="Wins" value={stats.wins} />
                <StatCell label="Draws" value={stats.draws} />
                <StatCell label="Losses" value={stats.losses} />
              </div>
              <div style={{ marginTop: 12 }}>
                <StatCell label="Win Rate" value={`${winRate}%`} accent="#00A8FF" />
              </div>
            </div>


            {/* Club leadership */}
            <div style={{ marginTop: 24, position: "relative" }}>
              <SectionHeader title="CLUB LEADERSHIP" />
              <div style={{ display: "grid", gridTemplateColumns: president && captain ? "1fr 1fr" : "1fr", gap: 12 }}>
                {president && (
                  <div style={{ ...panelBg, border: "1px solid rgba(245,197,66,0.35)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                    <MemberAvatar name={president.name ?? president.username} avatarUrl={president.avatarUrl} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...cellLabel, color: "#F5C542" }}>President</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {president.name ?? president.username}
                      </div>
                    </div>
                  </div>
                )}
                {captain && (
                  <div style={{ ...panelBg, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                    <MemberAvatar name={captain.name ?? captain.username} avatarUrl={captain.avatarUrl} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...cellLabel, color: "#00A8FF" }}>Captain</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {captain.name ?? captain.username}
                      </div>
                    </div>
                  </div>
                )}
                {!president && !captain && (
                  <div style={{ ...panelBg, padding: "18px 20px", fontSize: 16, fontWeight: 700, color: "#94A3B8", textAlign: "center" }}>
                    Leadership not available
                  </div>
                )}
              </div>
            </div>


            {/* Squad players */}
            <div style={{ marginTop: 24, position: "relative" }}>
              <SectionHeader title={`SQUAD PLAYERS (${stats.members})`} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {squad.map((m: any) => {
                  const mname: string = m.displayName ?? m.username ?? "Player";
                  const role = m.teamRole ?? (m.id === team.presidentId ? "president" : m.id === team.captainId ? "captain" : "player");
                  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
                  const isLeader = role === "president" || role === "captain";
                  return (
                    <div
                      key={m.id}
                      style={{
                        background: "#0B1626",
                        border: `1px solid ${isLeader ? "rgba(245,197,66,0.4)" : "rgba(0,168,255,0.18)"}`,
                        borderRadius: 14,
                        padding: "14px 8px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <MemberAvatar name={mname} avatarUrl={m.avatarUrl} size={64} />
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#FFFFFF", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                        {mname}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: isLeader ? "#F5C542" : "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5 }}>
                        {roleLabel}
                      </div>
                    </div>
                  );
                })}
                {squad.length === 0 && (
                  <div style={{ ...panelBg, padding: "18px 20px", fontSize: 16, fontWeight: 700, color: "#94A3B8", textAlign: "center", gridColumn: "1 / -1" }}>
                    No squad players
                  </div>
                )}
              </div>
            </div>


            {/* Transfer history */}
            <div style={{ marginTop: 24, position: "relative" }}>
              <SectionHeader title="TRANSFER HISTORY" />
              {transfersLoading ? (
                <div style={{ ...panelBg, padding: "18px 20px", fontSize: 16, fontWeight: 700, color: "#94A3B8", textAlign: "center" }}>
                  Loading transfers…
                </div>
              ) : recentTransfers.length === 0 ? (
                <div style={{ ...panelBg, padding: "18px 20px", fontSize: 16, fontWeight: 700, color: "#94A3B8", textAlign: "center" }}>
                  No transfer history available.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recentTransfers.map((t: any) => {
                    const incoming = t.toTeamId === team.id;
                    const playerLabel: string = t.playerName ?? t.playerUsername ?? "Player";
                    return (
                      <div key={t.id} style={{ ...panelBg, padding: "12px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                        <MemberAvatar name={playerLabel} avatarUrl={t.avatarUrl} size={48} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 900, color: "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {playerLabel}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8" }}>{fmtDate(t.transferredAt)}</div>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 0, maxWidth: "40%" }}>
                          <div style={{ ...cellLabel, fontSize: 11 }}>
                            {incoming ? "From" : "To"}: {(incoming ? t.fromTeamName : t.toTeamName) ?? "Free Agent"}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 900, color: "#00A8FF" }}>
                            {incoming ? `→ ${name}` : `${name} →`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ marginTop: "auto", paddingTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}>
              <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 6, color: "#94A3B8" }}>
                WARYAA <span style={{ color: "#00A8FF" }}>GAMING</span> COMMUNITY
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 4, color: "#F5C542" }}>
                PLAY • COMPETE • WIN
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
