import { useAuth } from "@/hooks/use-auth";

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading, loginWithDiscord } = useAuth();

  // Still checking auth — show minimal dark screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080e1c] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Not admin → maintenance panel
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#080e1c] flex flex-col items-center justify-center px-6 overflow-hidden relative">

        {/* Background glow blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-700/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Logo */}
        <div className="mb-10 flex items-center gap-3">
          <img src="/logo.png" alt="Waryaa Gaming" className="w-12 h-12 rounded-xl object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <span className="font-black text-white text-xl tracking-tight uppercase">Waryaa Gaming</span>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm bg-[#0f1628] border border-[#1e2a45] rounded-3xl p-8 text-center shadow-2xl">

          {/* Animated wrench / tools icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-600/20 to-purple-700/20 border border-cyan-500/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              className="w-9 h-9 text-cyan-400">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>

          <h1 className="font-black text-2xl text-white mb-2 tracking-tight">Under Construction</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-8">
            Our admins are working hard to get everything ready.<br />
            Check back soon!
          </p>

          {/* Animated dots row */}
          <div className="flex items-center justify-center gap-1.5 mb-8">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-2 h-2 rounded-full bg-cyan-500 opacity-80"
                style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>

          <button
            onClick={loginWithDiscord}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] active:scale-95 text-white text-sm font-black transition-all"
          >
            {/* Discord icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Admin Sign In
          </button>
        </div>

        <p className="mt-6 text-[11px] text-zinc-700">© {new Date().getFullYear()} Waryaa Gaming · All rights reserved</p>

        <style>{`
          @keyframes bounce {
            0%, 100% { transform: translateY(0); opacity: 0.6; }
            50% { transform: translateY(-6px); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // Admin — show the full site
  return <>{children}</>;
}
