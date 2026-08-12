import { Clock3, Handshake, type LucideIcon } from "lucide-react";

type ComingSoonPageProps = {
  section: "WG Academy" | "Partners";
};

export default function ComingSoonPage({ section }: ComingSoonPageProps) {
  const Icon: LucideIcon = section === "WG Academy" ? Clock3 : Handshake;

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl rounded-xl border border-primary/30 bg-card p-10 text-center shadow-lg shadow-primary/5">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
          <Icon className="h-8 w-8 text-primary" />
        </div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-primary">
          {section}
        </p>
        <h1 className="mb-4 text-4xl font-black uppercase tracking-tight">Coming Soon</h1>
        <p className="mx-auto max-w-lg text-muted-foreground">
          We&apos;re working on something special for the WG community. Check back soon for
          updates.
        </p>
      </div>
    </div>
  );
}