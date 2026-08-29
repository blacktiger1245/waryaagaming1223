import { useRef, useState, useEffect, useCallback } from "react";
import { toPng } from "html-to-image";
import { Download, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countryNameToFlag } from "@/lib/countries";

// Fixed export dimensions (4:5 portrait, social-media ready)
const CARD_W = 1080;
const CARD_H = 1350;

export interface PlayerCardStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  cleanSheets: number;
  motm: number;
  deciderWins: number;
}

interface PlayerCardProps {
  player: any;
  overall: PlayerCardStats;
  marketValue: string;
}

function sanitizeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_") || "player"
  );
}

const sectionLabel: React.CSSProperties = { fontSize: 17, fontWeight: 800, letterSpacing: 4, color: "#00A8FF" };
const sectionRule: React.CSSProperties = { flex: 1, height: 1, background: "linear-gradient(90deg, rgba(0,168,255,0.6), transparent)" };
const panelBg: React.CSSProperties = { background: "#0B1626", border: "1px solid rgba(0,168,255,0.25)", borderRadius: 16 };
const cellLabel: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 2 };

function StatCell({ label, value, accent = "#FFFFFF" }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: "#0B1626", border: "1px solid rgba(0,168,255,0.18)", borderRadius: 14, padding: "18px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 30, fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#101E32", border: "1px solid rgba(0,168,255,0.15)", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</span>
      <span style={{ fontSize: 19, fontWeight: 800, color: "#FFFFFF", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
      <div style={sectionLabel}>{title}</div>
      <div style={sectionRule} />
    </div>
  );
}

export default function PlayerCard({ player, overall, marketValue }: PlayerCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const displayName: string = player.displayName ?? player.username ?? "Player";
  const verified: boolean = !!player.verified;
  const country: string | null = player.country ?? null;
  const winRate = overall.played > 0 ? Math.round((overall.wins / overall.played) * 100) : 0;
  const p = player as any;

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
      a.download = `${sanitizeFilename(displayName)}-player-card.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Player card export failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [displayName, downloading]);

  const deviceLabel = p.gamingDevice === "pc" ? "PC" : p.gamingDevice === "mobile" ? "Mobile" : null;
  const device = p.deviceName ? (deviceLabel ? `${p.deviceName} (${deviceLabel})` : p.deviceName) : null;

  const personal: Array<[string, string]> = [
    ["Gaming Device", device ?? "Not Available"],
    ["KONAMI ID", p.konamiId ?? "Not Available"],
    ["Nationality", country ?? "Not Available"],
    ["Blood Group", p.bloodGroup ?? "Not Available"],
  ];

  const logoSrc = `${import.meta.env.BASE_URL}waryaalogo-removebg-preview.png`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-lg">Official Player Card</h3>
          <p className="text-sm text-muted-foreground">Premium 1080 x 1350 export — share on socials or Discord.</p>
        </div>
        <Button onClick={handleDownload} disabled={downloading} className="gap-2 font-bold">
          <Download className="w-4 h-4" />
          {downloading ? "Generating…" : "Download Player Card"}
        </Button>
      </div>

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
                style={{ height: 64, filter: "brightness(0) saturate(100%) invert(1)", opacity: 0.95 }}
              />
              <div style={{ border: "1.5px solid rgba(245,197,66,0.5)", borderRadius: 999, padding: "8px 22px", fontSize: 15, fontWeight: 800, letterSpacing: 3, color: "#F5C542", background: "rgba(245,197,66,0.08)" }}>
                OFFICIAL PLAYER CARD
              </div>
            </div>

            {/* Avatar with premium gradient frame + glow */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 36, position: "relative" }}>
              <div style={{ width: 270, height: 270, borderRadius: "50%", padding: 6, background: "linear-gradient(135deg, #00A8FF 0%, #0066FF 50%, #F5C542 100%)", boxShadow: "0 0 70px rgba(0,168,255,0.55)" }}>
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: "5px solid #07111F", background: "#0B1626", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {player.avatarUrl ? (
                    <img src={player.avatarUrl} alt={displayName} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 96, fontWeight: 900, color: "#00A8FF" }}>{displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Name + verified + nationality */}
            <div style={{ textAlign: "center", marginTop: 28, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <h1 style={{ fontSize: 54, fontWeight: 900, margin: 0, lineHeight: 1.05, color: "#FFFFFF" }}>{displayName}</h1>
                {verified && (
                  <img src={`${import.meta.env.BASE_URL}verified.png`} alt="Verified" style={{ width: 40, height: 40, objectFit: "contain" }} />
                )}
              </div>
              {country && (
                <div style={{ marginTop: 12, fontSize: 24, fontWeight: 700, color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{countryNameToFlag(country)}</span>
                  {country}
                </div>
              )}
            </div>

            {/* Club / Points / Rank strip */}
            <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 16, position: "relative" }}>
              <div style={{ ...panelBg, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                {player.teamLogoUrl ? (
                  <img src={player.teamLogoUrl} alt={player.teamName ?? "Club"} crossOrigin="anonymous" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,168,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Shield style={{ width: 28, height: 28, color: "#00A8FF" }} />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={cellLabel}>Current Club</div>
                  <div style={{ fontSize: 21, fontWeight: 800, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {player.teamName ?? "Free Agent"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: player.teamName ? "#4ADE80" : "#94A3B8" }}>
                    {player.teamName ? "Contract: Active" : "No club"}
                  </div>
                </div>
              </div>
              <div style={{ ...panelBg, padding: "18px 22px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={cellLabel}>Overall Points</div>
                <div style={{ fontSize: 38, fontWeight: 900, color: "#00A8FF", lineHeight: 1.1 }}>{Math.round(player.points ?? 0)}</div>
              </div>
              <div style={{ ...panelBg, border: "1px solid rgba(245,197,66,0.4)", padding: "18px 22px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={cellLabel}>Rank</div>
                <div style={{ fontSize: 38, fontWeight: 900, color: "#F5C542", lineHeight: 1.1 }}>{player.rank ? `#${player.rank}` : "—"}</div>
              </div>
            </div>

            {/* Career statistics */}
            <div style={{ marginTop: 26, position: "relative" }}>
              <SectionHeader title="CAREER STATISTICS" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCell label="Points" value={Math.round(player.points ?? 0)} accent="#00A8FF" />
                <StatCell label="Rank" value={player.rank ? `#${player.rank}` : "—"} accent="#F5C542" />
                <StatCell label="Apps" value={overall.played} />
                <StatCell label="Wins" value={overall.wins} />
                <StatCell label="Draws" value={overall.draws} />
                <StatCell label="Losses" value={overall.losses} />
                <StatCell label="Decider W" value={overall.deciderWins} />
                <StatCell label="Goals" value={overall.goals} />
                <StatCell label="Clean Sheets" value={overall.cleanSheets} />
                <StatCell label="Win Rate" value={`${winRate}%`} accent="#00A8FF" />
                <StatCell label="MOTM" value={overall.motm} accent="#F5C542" />
                <StatCell label="Cards" value={0} />
              </div>
            </div>

            {/* Personal information */}
            <div style={{ marginTop: 24, position: "relative" }}>
              <SectionHeader title="PERSONAL INFORMATION" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {personal.map(([label, value]) => (
                  <InfoRow key={label} label={label} value={value} />
                ))}
              </div>
            </div>

            {/* Market value / tournament wins / legacy cups */}
            <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, position: "relative" }}>
              <StatCell label="Market Value" value={marketValue} accent="#F5C542" />
              <StatCell label="Tournament Wins" value={player.tournamentWins ?? 0} accent="#F5C542" />
              <StatCell label="Legacy Cups" value={player.tournamentWins ?? 0} />
            </div>

            {/* Footer */}
            <div style={{ marginTop: "auto", paddingTop: 20, display: "flex", justifyContent: "center", position: "relative" }}>
              <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 6, color: "#94A3B8" }}>
                WARYAA <span style={{ color: "#00A8FF" }}>GAMING</span> COMMUNITY
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
