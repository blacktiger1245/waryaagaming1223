import { motion } from "framer-motion";
import { Store, UserPlus, Palette, ClipboardList, Users2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }),
};

const categories = [
  {
    icon: Users2,
    title: "Team Recruitment",
    description: "Teams post open roster spots, players post availability. Find your next squad or your next star player.",
  },
  {
    icon: UserPlus,
    title: "Coach Recruitment",
    description: "Connect teams with coaches who can review tactics, run scrims, and prepare rosters for tournaments.",
  },
  {
    icon: Palette,
    title: "Graphic Designer Recruitment",
    description: "Find designers for team logos, tournament graphics, banners, and social media content.",
  },
  {
    icon: ClipboardList,
    title: "Tournament Staff Applications",
    description: "Apply to help run WG tournaments as a bracket admin, referee, or match reporter.",
  },
];

export default function MarketplacePage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-14 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-6">
            <Store className="w-3.5 h-3.5" />
            Marketplace
          </div>
          <h1 className="text-5xl font-black uppercase tracking-tight mb-4">Community Marketplace</h1>
          <p className="text-muted-foreground text-lg">
            Where teams, coaches, designers, and tournament staff connect. Coming soon to WG.
          </p>
          <Badge className="mt-6 bg-primary/20 text-primary border-primary/30 uppercase tracking-wider text-xs">
            Launching Soon
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="rounded-xl border border-border bg-card p-8 hover:border-primary/40 transition-colors relative overflow-hidden"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center mb-5">
                <cat.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight mb-2">{cat.title}</h3>
              <p className="text-muted-foreground text-sm">{cat.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-14 rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">Want early access?</h3>
          <p className="text-muted-foreground text-sm">
            Join the Discord and get notified the moment the marketplace opens for listings.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
