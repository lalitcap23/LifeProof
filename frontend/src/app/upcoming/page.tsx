"use client";

const ROADMAP = [
  {
    phase: "Phase 1",
    label: "Live Now",
    status: "live",
    items: [
      {
        title: "Commitment Vault",
        desc: "Lock USDC or SOL with a nominee and a check-in interval. Vault PDA is program-controlled — zero custody.",
        tag: "DEVNET",
      },
      {
        title: "Proof of Life",
        desc: "Owner signs a `proof_of_life` transaction to roll the deadline forward. Fully on-chain, no backend.",
        tag: "LIVE",
      },
      {
        title: "Permissionless Claim",
        desc: "After deadline + 48h grace, `claim_vault` is callable by anyone. Funds always go to the nominee.",
        tag: "LIVE",
      },
      {
        title: "Good Samaritan Dashboard",
        desc: "Built-in UI showing all claimable vaults across the protocol. Anyone can execute in one click.",
        tag: "LIVE",
      },
      {
        title: "GitHub Actions Keeper Bot",
        desc: "Automated TypeScript bot runs every 2 days via GitHub Actions, scanning and claiming expired vaults.",
        tag: "LIVE",
      },
    ],
  },
  {
    phase: "Phase 2",
    label: "In Progress",
    status: "progress",
    items: [
      {
        title: "Kamino Yield Integration",
        desc: "On mainnet, deposited tokens are routed into Kamino Finance reserves. kTokens accumulate yield while the vault is active. Redeemed on claim or close.",
        tag: "MAINNET",
      },
      {
        title: "Mainnet Deployment",
        desc: "Full production deployment with Kamino CPI, `refresh_reserve` in the same transaction, and live kToken exchange rate redemption.",
        tag: "COMING",
      },
      {
        title: "Automated Keeper Network",
        desc: "Decentralized network of keeper bots — multiple independent operators scanning for expired vaults. Redundant execution guarantees the nominee always receives funds.",
        tag: "COMING",
      },
    ],
  },
  {
    phase: "Phase 3",
    label: "Upcoming",
    status: "upcoming",
    items: [
      {
        title: "LifeProof Wallet (Full Extension)",
        desc: "A full-fledged Solana wallet as a browser extension — native to LifeProof, not a thin layer on Phantom. Countdowns, notifications, one-click proof of life, vault creation, and transfers in one toolbar. Solves the huge community problem: people forget to open dApps and miss check-ins; this puts the protocol where they already work every day.",
        tag: "UPCOMING",
        highlight: true,
      },
      {
        title: "Mobile Companion App",
        desc: "iOS and Android app with biometric-gated proof of life. One face or fingerprint scan triggers a signed Solana transaction — the lowest-friction check-in possible.",
        tag: "UPCOMING",
        highlight: true,
      },
      {
        title: "Multi-Asset Support",
        desc: "Support for any SPL token — not just USDC and SOL. Vaults holding stablecoins, LSTs, or DeFi LP tokens.",
        tag: "UPCOMING",
      },
      {
        title: "Social Recovery Nominee",
        desc: "Set multiple nominees with a threshold (e.g. 2-of-3 multisig). Funds are only released when the required number of nominees co-sign the claim.",
        tag: "RESEARCH",
      },
    ],
  },
  {
    phase: "Phase 4",
    label: "Research",
    status: "research",
    items: [
      {
        title: "Cross-Chain Vaults",
        desc: "Extend LifeProof to EVM chains via Wormhole or LayerZero. A Solana vault can have a nominee on Ethereum or Arbitrum.",
        tag: "RESEARCH",
      },
      {
        title: "Legal Wrapper",
        desc: "Partnership with legal firms to attach an on-chain vault to a verifiable estate document. The vault becomes the execution layer for a digital will.",
        tag: "RESEARCH",
      },
      {
        title: "zkProof of Life",
        desc: "Zero-knowledge proof that the owner is alive without revealing which wallet they are — preserving privacy while still satisfying the on-chain liveness check.",
        tag: "RESEARCH",
      },
    ],
  },
];

const STATUS_STYLES: Record<string, { dot: string; label: string; border: string; bg: string }> = {
  live:     { dot: "bg-green-500", label: "text-green-600",  border: "border-green-200",  bg: "bg-green-50"   },
  progress: { dot: "bg-amber-500 animate-pulse", label: "text-amber-600",  border: "border-amber-200",  bg: "bg-amber-50"   },
  upcoming: { dot: "bg-stone-400", label: "text-stone-500",  border: "border-stone-200",  bg: "bg-stone-100"  },
  research: { dot: "bg-stone-300", label: "text-stone-400",  border: "border-stone-100",  bg: "bg-stone-50"   },
};

const TAG_STYLES: Record<string, string> = {
  LIVE:     "bg-green-50 text-green-700 border-green-200",
  DEVNET:   "bg-amber-50 text-amber-700 border-amber-200",
  MAINNET:  "bg-amber-50 text-amber-700 border-amber-200",
  COMING:   "bg-stone-100 text-stone-600 border-stone-200",
  UPCOMING: "bg-stone-100 text-stone-600 border-stone-200",
  RESEARCH: "bg-stone-50 text-stone-400 border-stone-100",
};

export default function UpcomingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">

      {/* ── Dark Hero ── */}
      <section className="bg-stone-950 pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#d97706 1px, transparent 1px), linear-gradient(90deg, #d97706 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        <div className="relative max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-2 border border-stone-700 rounded-full px-3 py-1.5 mb-10">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-stone-400 tracking-widest uppercase">
              Protocol Roadmap
            </span>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <div>
              <h1 className="text-6xl sm:text-7xl font-bold tracking-tighter text-white leading-none mb-6">
                What&apos;s<br />
                <span className="text-amber-500">Coming</span>
              </h1>
              <p className="text-base text-stone-400 leading-relaxed max-w-lg">
                LifeProof is in active development — from the keeper network that automatically
                executes claims, to a{" "}
                <span className="text-stone-200 font-semibold">full-fledged wallet extension</span>{" "}
                built for this community: one place for custody, check-ins, and vaults so nobody
                loses a stake because they forgot to open a dApp.
              </p>
            </div>

            {/* Phase overview terminal */}
            <div className="bg-stone-900 border border-stone-700 rounded-xl p-5 font-mono text-xs">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-800">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                </div>
                <span className="text-stone-500 text-[10px] ml-1">roadmap.json</span>
              </div>
              <div className="space-y-2">
                {[
                  { phase: "Phase 1", label: "Commitment vaults, keeper, dashboard", status: "✓ live" , c: "text-green-400" },
                  { phase: "Phase 2", label: "Kamino yield + mainnet deployment",     status: "⚡ in progress", c: "text-amber-400" },
                  { phase: "Phase 3", label: "Full wallet extension + mobile app",     status: "· upcoming", c: "text-stone-500" },
                  { phase: "Phase 4", label: "Cross-chain + legal wrapper + zkProof", status: "· research", c: "text-stone-600" },
                ].map((row) => (
                  <div key={row.phase} className="flex gap-3">
                    <span className="text-stone-600 w-16 shrink-0">{row.phase}</span>
                    <span className="text-stone-400 flex-1 truncate">{row.label}</span>
                    <span className={`shrink-0 ${row.c}`}>{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Keeper guarantee banner ── */}
      <div className="bg-amber-600 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-white/80 tracking-widest uppercase">Execution Guarantee</span>
          </div>
          <p className="text-sm text-white">
            When a vault&apos;s deadline passes, the keeper bot network <span className="font-bold">will automatically execute</span> the
            claim — every 48 hours, on a guaranteed schedule. The nominee <span className="font-bold">always receives the funds</span>,
            even if no one manually triggers it.
          </p>
        </div>
      </div>

      {/* ── Roadmap phases ── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-16">
          {ROADMAP.map((phase) => {
            const s = STATUS_STYLES[phase.status];
            return (
              <div key={phase.phase}>
                {/* Phase header */}
                <div className="flex items-center gap-4 mb-8">
                  <div className={`inline-flex items-center gap-2 ${s.bg} border ${s.border} rounded-full px-4 py-1.5`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className={`text-[10px] font-bold ${s.label} tracking-widest uppercase`}>
                      {phase.phase} — {phase.label}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-stone-200" />
                </div>

                {/* Items grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {phase.items.map((item) => (
                    <div
                      key={item.title}
                      className={`bg-white rounded-xl p-6 border transition-colors ${
                        item.highlight
                          ? "border-amber-300 shadow-sm shadow-amber-100"
                          : "border-stone-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span
                          className={`inline-block text-[9px] font-mono font-bold tracking-widest uppercase border px-2 py-0.5 rounded ${
                            TAG_STYLES[item.tag] ?? "bg-stone-100 text-stone-500 border-stone-200"
                          }`}
                        >
                          {item.tag}
                        </span>
                        {item.highlight && (
                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                            Featured
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-stone-900 mb-2">{item.title}</h3>
                      <p className="text-xs text-stone-500 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Keeper guarantee deep dive ── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-stone-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-12">
            <span className="text-[10px] font-bold text-amber-500 tracking-widest uppercase">Guarantee</span>
            <h2 className="text-3xl font-bold text-white tracking-tight">
              The Nominee Will Always Receive the Funds
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div className="space-y-5">
              <p className="text-stone-400 leading-relaxed text-sm">
                LifeProof is designed so that{" "}
                <span className="text-white font-semibold">no single point of failure</span>{" "}
                can prevent a nominee from receiving their funds. The execution guarantee works in layers:
              </p>
              <div className="space-y-4">
                {[
                  {
                    n: "01",
                    title: "GitHub Actions Keeper (always on)",
                    desc: "A dedicated keeper bot runs on GitHub Actions every 2 days — fully automated, no human needed. It scans all active vaults, identifies expired ones, and executes `claim_vault`.",
                    live: true,
                  },
                  {
                    n: "02",
                    title: "Good Samaritan Dashboard (open to anyone)",
                    desc: "Any person on the internet can visit /keeper, see all claimable vaults, and trigger the transfer themselves — earning ~0.002 SOL vault rent as a reward.",
                    live: true,
                  },
                  {
                    n: "03",
                    title: "Decentralized Keeper Network (coming)",
                    desc: "Multiple independent operators running keeper bots. If one fails, others pick it up. The more operators, the shorter the average time-to-execution after deadline.",
                    live: false,
                  },
                  {
                    n: "04",
                    title: "Nominee Self-Execution (always possible)",
                    desc: "The nominee themselves can always call `claim_vault` directly. They don't need to wait for a keeper — they can trigger it the moment the grace period ends.",
                    live: true,
                  },
                ].map((layer) => (
                  <div key={layer.n} className="flex gap-4">
                    <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-mono font-bold ${
                      layer.live ? "bg-amber-600 text-white" : "bg-stone-700 text-stone-400"
                    }`}>
                      {layer.n}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-white">{layer.title}</p>
                        {layer.live && (
                          <span className="text-[9px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 leading-relaxed">{layer.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution timeline terminal */}
            <div className="bg-stone-900 border border-stone-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-stone-800 border-b border-stone-700 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500/50" />
                  <span className="w-2 h-2 rounded-full bg-amber-500/50" />
                  <span className="w-2 h-2 rounded-full bg-green-500/50" />
                </div>
                <span className="text-stone-500 font-mono text-[10px] ml-1">execution guarantee — timeline</span>
              </div>
              <div className="p-5 font-mono text-xs space-y-2">
                <p className="text-stone-600">[ Vault deadline passes ]</p>
                <p className="text-stone-500"><span className="text-stone-600">+0h</span>  ·  grace period begins (48h buffer)</p>
                <p className="text-stone-500"><span className="text-stone-600">+1h</span>  ·  /keeper dashboard shows vault as claimable</p>
                <p className="text-stone-500"><span className="text-stone-600">+2h</span>  ·  any Good Samaritan can execute</p>
                <p className="text-stone-500"><span className="text-stone-600">+48h</span> ·  grace period ends — fully claimable</p>
                <div className="border-t border-stone-800 my-2" />
                <p className="text-amber-400">[ GitHub Actions keeper runs ]</p>
                <p className="text-stone-400"><span className="text-amber-600">&gt;</span> scan_vaults() → found expired: 1</p>
                <p className="text-stone-400"><span className="text-amber-600">&gt;</span> claim_vault(vault_address)</p>
                <p className="text-green-400">  ✓ tx confirmed</p>
                <p className="text-green-400">  ✓ funds → nominee_wallet</p>
                <p className="text-green-400">  ✓ rent → keeper_wallet</p>
                <div className="border-t border-stone-800 my-2" />
                <p className="text-stone-500">Runs again in 48h. Guaranteed.</p>
                <p className="text-[10px] text-stone-600 mt-3">
                  Nominee ALWAYS receives funds — whether via keeper, Good Samaritan, or self-execution.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Highlighted upcoming: Wallet Extension ── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-12">
            <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase">Most Requested</span>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Full-Fledged Wallet (Extension)</h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-stone-950 rounded-xl p-8 border border-stone-800">
              <div className="flex items-center gap-3 mb-6">
                <span className="inline-flex items-center gap-2 bg-amber-600/20 border border-amber-600/30 rounded-full px-3 py-1">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase">Coming Phase 3</span>
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight">
                Built for the community problem: habit, not hype
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed mb-7">
                A complete LifeProof wallet in the browser — custody, vaults, proof of life, and nominee
                awareness without bouncing between Phantom and a tab you forgot about. That&apos;s how
                we scale real usage: make the dead man&apos;s switch as easy as unlocking your laptop,
                so the protocol works for normal people, not only power users.
              </p>
              <div className="grid sm:grid-cols-2 gap-5">
                {[
                  { icon: "🔐", title: "Full wallet in one extension", desc: "Keys, signing, and LifeProof flows together — no separate wallet app required for day-to-day check-ins." },
                  { icon: "⏱", title: "Live deadline countdown", desc: "Persistent badge on the extension icon showing time remaining before your next check-in is due." },
                  { icon: "🔔", title: "Push notifications", desc: "Browser alerts at 24h, 6h, and 1h before your deadline. You choose the thresholds." },
                  { icon: "⚡", title: "One-click proof of life", desc: "Sign `proof_of_life` directly from the extension popup — no navigation, no dApp, no friction." },
                ].map((f) => (
                  <div key={f.title} className="flex gap-3">
                    <span className="text-lg shrink-0">{f.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-stone-200 mb-0.5">{f.title}</p>
                      <p className="text-xs text-stone-500 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm shadow-amber-50">
                <p className="text-[10px] font-bold text-amber-600 tracking-widest uppercase mb-3">Why it matters</p>
                <p className="text-sm text-stone-600 leading-relaxed">
                  The huge community gap is friction and forgetfulness — not trust in the chain.
                  A full extension wallet removes that gap by meeting users in the browser with
                  everything they need in one product.
                </p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-5">
                <p className="text-[10px] font-bold text-stone-400 tracking-widest uppercase mb-3">Mobile (Phase 3)</p>
                <p className="text-sm text-stone-600 leading-relaxed">
                  iOS and Android companion app. Biometric-gated — one face or fingerprint
                  scan signs and submits the Solana transaction. Zero text, zero navigation.
                </p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-5">
                <p className="text-[10px] font-bold text-stone-400 tracking-widest uppercase mb-3">Open Contribution</p>
                <p className="text-sm text-stone-600 leading-relaxed">
                  Both the extension and mobile app will be fully open source.
                  Contributions welcome — a dead man&apos;s switch works best when the code
                  is transparent.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-stone-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-start gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">LP</span>
            </div>
            <span className="text-sm font-bold text-stone-900">LifeProof</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-stone-400">
            {["Open Source", "No Admin Key", "Permissionless", "Built on Solana"].map((t) => (
              <span key={t} className="font-mono">{t}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
