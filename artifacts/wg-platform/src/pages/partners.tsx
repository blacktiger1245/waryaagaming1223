import { motion } from "framer-motion";
import { Shield, Handshake, Users } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }),
};

export default function PartnersPage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-14 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-6">
            <Handshake className="w-3.5 h-3.5" />
            Partners
          </div>
          <h1 className="text-5xl font-black uppercase tracking-tight mb-4">Our Partners</h1>
          <p className="text-muted-foreground text-lg">
            WG is built alongside organizations and sponsors who invest in the future of Somali esports.
          </p>
        </div>

        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="rounded-xl border border-primary/30 bg-card p-10 mb-10 flex flex-col md:flex-row items-center gap-8 glow-primary"
        >
          <div className="w-20 h-20 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          <div>
            <p className="text-primary text-xs font-bold uppercase tracking-widest mb-1">Official Federation</p>
            <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Somali Esports Federation</h2>
            <p className="text-muted-foreground text-sm">
              WG operates under the official recognition of the Somali Esports Federation, governing competitive
              standards, tournament rules, and player conduct across the community.
            </p>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 mb-14">
          <motion.div
            custom={1}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="rounded-xl border border-border bg-card p-8"
          >
            <Users className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-lg font-black uppercase tracking-tight mb-2">Sponsors</h3>
            <p className="text-muted-foreground text-sm mb-4">
              We're actively building relationships with brands who want to power prize pools and community events.
            </p>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Slots opening soon</p>
          </motion.div>

          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="rounded-xl border border-border bg-card p-8"
          >
            <Handshake className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-lg font-black uppercase tracking-tight mb-2">Community Partners</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Creators, media outlets, and community organizers who help amplify WG events across the region.
            </p>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Applications open</p>
          </motion.div>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">Want to partner with WG?</h3>
          <p className="text-muted-foreground text-sm">
            Reach out through the Discord server to discuss sponsorship or partnership opportunities.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
