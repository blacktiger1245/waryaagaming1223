import { motion } from "framer-motion";
import { BookOpen, Target, Users2, ScrollText, PlayCircle } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }),
};

const categories = [
  {
    icon: PlayCircle,
    title: "eFootball Guides",
    description: "Master the fundamentals — controls, formations, and matchday preparation for every skill level.",
    topics: ["Beginner controls walkthrough", "Best formations by playstyle", "Skill move combos", "Set-piece mastery"],
  },
  {
    icon: Target,
    title: "Team Tactics",
    description: "Build a system that wins. Learn the tactical setups used by WG's top-ranked squads.",
    topics: ["Pressing triggers", "Counter-attack systems", "Defensive shape vs top teams", "In-game adjustments"],
  },
  {
    icon: Users2,
    title: "Coaching Tips",
    description: "Guidance for captains and coaches building a competitive roster and match-day mentality.",
    topics: ["Scouting your roster", "Pre-match preparation", "Reviewing match footage", "Mental preparation"],
  },
  {
    icon: ScrollText,
    title: "Tournament Rules",
    description: "Everything you need to know before you register — formats, conduct, and dispute resolution.",
    topics: ["Registration requirements", "Match reporting procedure", "Code of conduct", "Dispute & appeals process"],
  },
];

export default function AcademyPage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-14 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            WG Academy
          </div>
          <h1 className="text-5xl font-black uppercase tracking-tight mb-4">Level Up Your Game</h1>
          <p className="text-muted-foreground text-lg">
            Guides, tactics, and coaching resources built by the WG community to sharpen every player's edge.
          </p>
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
              className="rounded-xl border border-border bg-card p-8 hover:border-primary/40 transition-colors"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center mb-5">
                <cat.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight mb-2">{cat.title}</h3>
              <p className="text-muted-foreground text-sm mb-5">{cat.description}</p>
              <ul className="space-y-2">
                {cat.topics.map((topic) => (
                  <li key={topic} className="flex items-center gap-2 text-sm text-foreground/90">
                    <span className="w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                    {topic}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-14 rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">New guides added regularly</h3>
          <p className="text-muted-foreground text-sm">
            Join the Discord to request a topic or contribute a guide of your own.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
