"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

const PROGRAM_ID = "DHHHbFFGWX2y4HkgdePB61bUZxdJQw8VmfGvgR4cxeof";

export default function Home() {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen bg-[#FAFAF8]">

      {/* ── DARK HERO ── */}
      <section className="bg-stone-950 pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#d97706 1px, transparent 1px), linear-gradient(90deg, #d97706 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        <div className="relative max-w-6xl mx-auto">

          {/* Status pill */}
          <div className="flex items-center gap-3 mb-10">
            <div className="inline-flex items-center gap-2 border border-stone-700 rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-stone-400 tracking-widest uppercase">
                Live on Devnet · Mainnet Ready
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 border border-stone-800 rounded-full px-3 py-1.5">
              <span className="text-[10px] font-mono text-stone-500">
                {PROGRAM_ID.slice(0, 8)}...{PROGRAM_ID.slice(-6)}
              </span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <div>
              <h1 className="text-7xl sm:text-8xl lg:text-[88px] font-bold tracking-tighter text-white leading-none mb-6">
                Life<span className="text-amber-500">Proof</span>
              </h1>
              <p className="text-lg text-stone-400 leading-relaxed mb-8 max-w-lg">
                A dead man&apos;s switch on Solana.{" "}
                <span className="text-stone-200">
                  Lock tokens in a vault, prove you&apos;re alive on a schedule.
                  Miss the deadline — your nominated wallet inherits everything.
                </span>
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {connected ? (
                  <>
                    <Link href="/create" className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 px-8 rounded-lg transition-colors text-sm tracking-wide">
                      Create Vault
                    </Link>
                    <Link href="/dashboard" className="border border-stone-600 hover:border-stone-400 text-stone-300 hover:text-white font-medium py-3.5 px-8 rounded-lg transition-colors text-sm">
                      View Dashboard
                    </Link>
                  </>
                ) : (
                  <p className="text-stone-500 text-sm pt-1">Connect your wallet above to get started</p>
                )}
              </div>
            </div>

            {/* Terminal card */}
            <div className="bg-stone-900 border border-stone-700 rounded-xl p-5 font-mono text-xs">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-800">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-stone-500 text-[10px] ml-1">proof_pol — protocol</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { k: "network", v: "devnet (mainnet-ready)", accent: false },
                  { k: "program_id", v: `${PROGRAM_ID.slice(0,12)}...`, accent: false },
                  { k: "yield_strategy", v: "Kamino Finance (mainnet)", accent: true },
                  { k: "grace_period", v: "172,800 sec (48 hours)", accent: false },
                  { k: "keeper", v: "permissionless — anyone", accent: true },
                  { k: "custody", v: "ZERO — vault PDA only", accent: false },
                  { k: "admin_key", v: "NONE", accent: false },
                  { k: "upgrade_authority", v: "NONE", accent: false },
                ].map((row) => (
                  <div key={row.k} className="flex gap-3">
                    <span className="text-stone-500 w-36 shrink-0">{row.k}</span>
                    <span className="text-stone-400">:</span>
                    <span className={row.accent ? "text-amber-400" : "text-stone-200"}>{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROTOCOL STATS ── */}
      <div className="bg-amber-600 py-3 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0 sm:divide-x divide-amber-500">
          {[
            { label: "Grace Period", value: "48h" },
            { label: "Custody", value: "Zero" },
            { label: "Yield Source", value: "Kamino" },
            { label: "Execution", value: "Permissionless" },
          ].map((stat) => (
            <div key={stat.label} className="sm:px-6 first:pl-0 last:pr-0">
              <p className="text-[9px] font-bold text-amber-200 tracking-widest uppercase">{stat.label}</p>
              <p className="text-sm font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-14">
            <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase">01 / Protocol</span>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">How It Works</h2>
          </div>
          <div className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-stone-200 border border-stone-200 rounded-xl overflow-hidden">
            {[
              { step: "01", title: "Create Vault", desc: "Stake USDC or SOL, set a nominee wallet and check-in interval. On mainnet, funds immediately enter Kamino to earn yield.", dark: false },
              { step: "02", title: "Prove You're Alive", desc: "Sign a `proof_of_life` transaction before your deadline to roll it forward by one interval.", dark: false },
              { step: "03", title: "Stay Active", desc: "Every check-in resets the clock. Your vault accumulates yield on Kamino the entire time.", dark: false },
              { step: "—", title: "Or Lose It", desc: "Miss the deadline + 48h grace period, and the keeper bot or anyone on the network can execute the transfer to your nominee.", dark: true },
            ].map((item) => (
              <div key={item.step} className={`p-8 ${item.dark ? "bg-stone-900" : "bg-white"}`}>
                <div className={`text-5xl font-bold mb-6 leading-none font-mono ${item.dark ? "text-amber-500" : "text-stone-100"}`}>
                  {item.step}
                </div>
                <h3 className={`text-xs font-bold mb-3 uppercase tracking-widest ${item.dark ? "text-white" : "text-stone-900"}`}>
                  {item.title}
                </h3>
                <p className={`text-sm leading-relaxed ${item.dark ? "text-stone-400" : "text-stone-500"}`}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KAMINO YIELD STRATEGY ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-stone-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-14">
            <span className="text-[10px] font-bold text-amber-500 tracking-widest uppercase">02 / Mainnet</span>
            <h2 className="text-3xl font-bold text-white tracking-tight">Kamino Yield Strategy</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div className="space-y-6">
              <p className="text-stone-400 leading-relaxed">
                On mainnet, every token deposited into Aegis Vault is automatically routed into{" "}
                <span className="text-amber-400 font-semibold">Kamino Finance</span> — Solana&apos;s
                largest lending protocol. Your vault doesn&apos;t just sit idle. It earns.
              </p>

              <div className="space-y-4">
                {[
                  {
                    title: "kToken Receipt Tokens",
                    desc: "When you deposit USDC, Kamino issues kTokens (e.g. kUSDC) as a receipt. The exchange rate grows as interest accrues, so 100 kUSDC today redeems for more than 100 USDC tomorrow.",
                  },
                  {
                    title: "Auto-Compounding APY",
                    desc: "Kamino's reserves automatically compound yields from borrowers. You don't need to do anything — the kToken exchange rate continuously increases.",
                  },
                  {
                    title: "Full Redemption on Claim",
                    desc: "Whether the owner closes their vault or the nominee claims it, the program calls `redeem_reserve_collateral` on Kamino — burning kTokens for the full underlying balance plus all accrued yield.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="w-px bg-amber-600/50 shrink-0 mt-1" />
                    <div>
                      <p className="text-sm font-bold text-white mb-1">{item.title}</p>
                      <p className="text-sm text-stone-400 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Flow diagram */}
            <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 font-mono text-xs space-y-3">
              <p className="text-[10px] text-stone-500 uppercase tracking-widest mb-4">
                › deposit_reserve_liquidity flow
              </p>
              {[
                { from: "Owner wallet", to: "vault_ata (PDA)", label: "transfer tokens", color: "text-stone-300" },
                { from: "vault_ata", to: "Kamino reserve", label: "deposit_reserve_liquidity", color: "text-amber-400" },
                { from: "Kamino reserve", to: "vault_ktoken_ata", label: "mint kTokens (receipt)", color: "text-amber-400" },
                { from: "Time passes", to: "kToken value", label: "exchange rate ↑ (yield)", color: "text-green-400" },
                { from: "vault_ktoken_ata", to: "Kamino reserve", label: "redeem_reserve_collateral", color: "text-amber-400" },
                { from: "Kamino reserve", to: "nominee_ata", label: "tokens + yield → nominee", color: "text-stone-300" },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                  <span className="text-stone-500 truncate">{row.from}</span>
                  <span className="text-stone-700 px-1">→</span>
                  <div className="min-w-0">
                    <span className="text-stone-400 block truncate">{row.to}</span>
                    <span className={`text-[9px] ${row.color}`}>{row.label}</span>
                  </div>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-stone-800 text-[10px] text-stone-500">
                Only active on <span className="text-amber-500">mainnet</span>. Devnet vaults hold tokens in vault ATA directly.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AUTO TRANSFER TIMELINE ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-14">
            <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase">03 / Execution</span>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Auto Asset Transfer</h2>
          </div>

          <p className="text-stone-500 max-w-2xl mb-12 text-sm leading-relaxed">
            Once a deadline passes and the 48-hour grace period expires, the vault enters a{" "}
            <span className="text-stone-900 font-semibold">claimable state</span>. No central server
            decides this — it&apos;s enforced entirely on-chain by the Anchor program.
          </p>

          {/* Timeline */}
          <div className="relative">
            {/* connector line */}
            <div className="absolute top-5 left-5 right-5 h-px bg-stone-200 hidden sm:block" />
            <div className="grid sm:grid-cols-5 gap-4 relative">
              {[
                { t: "T + 0", label: "Vault Created", desc: "Tokens locked. Kamino deposit executed (mainnet). Clock starts.", ok: true },
                { t: "T + interval", label: "Check-in Due", desc: "Owner signs `proof_of_life`. Deadline rolls forward. Kamino keeps earning.", ok: true },
                { t: "T + miss", label: "Deadline Missed", desc: "Owner did not check in. Vault remains active but clock has expired.", ok: false },
                { t: "+ 48 hours", label: "Grace Period", desc: "48-hour buffer gives the owner one last chance to check in or close.", ok: false },
                { t: "Claimable", label: "Anyone Executes", desc: "`claim_vault` is now callable by anyone. Funds go to nominee.", amber: true },
              ].map((step, i) => (
                <div key={i} className="relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 border-2 relative z-10 ${
                    step.amber ? "bg-amber-600 border-amber-600" :
                    step.ok ? "bg-white border-stone-300" : "bg-white border-red-300"
                  }`}>
                    {step.amber ? (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-[10px] font-mono font-bold ${step.ok ? "text-stone-400" : "text-red-400"}`}>{i + 1}</span>
                    )}
                  </div>
                  <p className={`text-[9px] font-mono font-bold tracking-widest uppercase mb-1 ${
                    step.amber ? "text-amber-600" : step.ok ? "text-stone-400" : "text-red-400"
                  }`}>{step.t}</p>
                  <p className="text-xs font-bold text-stone-900 mb-1">{step.label}</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 bg-stone-50 border border-stone-200 rounded-xl p-6">
            <p className="text-xs font-bold text-stone-900 uppercase tracking-widest mb-3">On-Chain Guarantee</p>
            <p className="text-sm text-stone-500 leading-relaxed max-w-3xl">
              The nominee address is written immutably into the vault PDA at creation.{" "}
              <span className="text-stone-900 font-medium">No program instruction exists</span> that allows the nominee
              to be changed after creation. The `claim_vault` instruction verifies the caller is passing
              the correct nominee via <code className="bg-stone-200 px-1 rounded text-xs font-mono">has_one = nominee</code> on
              the vault account constraint. The program transfers to the nominee — not to the caller.
            </p>
          </div>
        </div>
      </section>

      {/* ── EXECUTION GUARANTEE ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-stone-100 border-y border-stone-200">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase">04 / Guarantee</span>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">The Nominee Will Always Receive the Funds</h2>
          </div>

          {/* Guarantee banner */}
          <div className="bg-stone-950 border border-amber-600/40 rounded-xl p-5 mb-10 flex items-start gap-4">
            <span className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0 animate-pulse" />
            <p className="text-sm text-stone-300 leading-relaxed">
              After a deadline passes and the 48-hour grace period expires, the keeper bot network{" "}
              <span className="text-amber-400 font-bold">automatically executes</span> the claim — on a guaranteed schedule,
              every 48 hours. Even if no one manually triggers it,{" "}
              <span className="text-white font-bold">the nominee will receive their funds</span>.
              Anyone can also execute it themselves and earn the vault rent as a reward.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-10">
            <div className="space-y-4">
              {[
                {
                  icon: "🤖",
                  tag: "AUTOMATED",
                  title: "GitHub Actions keeper — runs every 48h",
                  desc: "A TypeScript keeper bot is scheduled via GitHub Actions to scan all vaults and execute `claim_vault` for every expired one. No human required. It runs on a fixed schedule — guaranteed.",
                  amber: true,
                },
                {
                  icon: "🤝",
                  tag: "OPEN",
                  title: "Good Samaritan dashboard",
                  desc: "Any person can visit /keeper, see all claimable vaults in real time, and execute transfers in one click — earning ~0.002 SOL vault rent per claim.",
                  amber: false,
                },
                {
                  icon: "🔑",
                  tag: "SELF",
                  title: "Nominee self-execution",
                  desc: "The nominee can always trigger `claim_vault` themselves, the moment the grace period ends. No keeper needed — maximum control for the beneficiary.",
                  amber: false,
                },
              ].map((item) => (
                <div key={item.title} className={`bg-white border rounded-xl p-5 flex gap-4 ${item.amber ? "border-amber-300 shadow-sm shadow-amber-50" : "border-stone-200"}`}>
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-stone-900">{item.title}</p>
                      {item.amber && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full tracking-widest uppercase">
                          Always On
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Keeper terminal */}
            <div className="bg-stone-950 border border-stone-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-stone-900 border-b border-stone-700 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-stone-500 font-mono text-[10px] ml-1">keeper.ts — automated run</span>
              </div>
              <div className="p-5 font-mono text-xs space-y-2">
                <p className="text-stone-600"># GitHub Actions — every 48h, guaranteed</p>
                <p className="text-stone-500">$ npx ts-node keeper.ts --once</p>
                <p className="text-stone-400"><span className="text-amber-500">›</span> Connecting to devnet…</p>
                <p className="text-stone-400"><span className="text-amber-500">›</span> Scanning program accounts…</p>
                <p className="text-stone-400"><span className="text-stone-600">  found 12 active vaults</span></p>
                <p className="text-stone-400"><span className="text-amber-500">›</span> Checking deadlines…</p>
                <p className="text-green-400">  ✓ vault 3HkdX... expired 26h ago — claimable</p>
                <p className="text-stone-600">  · vault 9mPqW... 4d 12h remaining — skip</p>
                <p className="text-stone-400"><span className="text-amber-500">›</span> Executing claim_vault for 3HkdX...</p>
                <p className="text-green-400">  ✓ tx confirmed: 4xKp9m...Bwz</p>
                <p className="text-green-400">  ✓ funds → nominee F7mRqz...</p>
                <p className="text-green-400">  ✓ rent reclaimed: +0.00203 SOL</p>
                <div className="border-t border-stone-800 mt-3 pt-3">
                  <p className="text-stone-600">Next run: in 47h 59m</p>
                  <p className="text-amber-500/60 text-[10px] mt-1">Nominee always receives — guaranteed.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMING SOON: WALLET EXTENSION ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-14">
            <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase">05 / Roadmap</span>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Browser Companion (thin extension)</h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Main card */}
            <div className="lg:col-span-2 bg-stone-950 rounded-xl p-8 border border-stone-800">
              <div className="inline-flex items-center gap-2 bg-amber-600/20 border border-amber-600/30 rounded-full px-3 py-1 mb-6">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase">Coming Soon</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Solves the biggest community problem: forgetting to check in
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed mb-6">
                A lightweight extension that works with Phantom, Solflare, or Backpack — not a new wallet.
                Deadline countdown on the icon, optional reminders, and deep links into Aegis Vault so
                check-ins are one click away. Your keys stay in the wallet you already trust.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { label: "Works with your existing wallet", desc: "Compatible with Phantom, Solflare, and Backpack — no new seed phrase, no custody change" },
                  { label: "Deadline countdown badge", desc: "Persistent badge on the extension icon shows how much time remains until your next check-in" },
                  { label: "Optional reminders", desc: "Browser alerts 24h, 6h, and 1h before your deadline expires — opt in, zero spam" },
                  { label: "One-click proof of life", desc: "Deep links open the right Aegis Vault page instantly — check in without hunting for the dApp" },
                ].map((f) => (
                  <div key={f.label} className="flex gap-3">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-stone-200">{f.label}</p>
                      <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Why it's needed */}
            <div className="space-y-4">
              <div className="bg-white border border-stone-200 rounded-xl p-6">
                <p className="text-[10px] font-bold text-amber-600 tracking-widest uppercase mb-3">Why it matters</p>
                <p className="text-sm text-stone-600 leading-relaxed">
                  The community problem isn&apos;t the smart contract — it&apos;s human habit.
                  A thin companion sitting in the toolbar makes check-ins frictionless without asking
                  anyone to trust a new wallet or move their keys. Low barrier, high reliability.
                </p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-6">
                <p className="text-[10px] font-bold text-amber-600 tracking-widest uppercase mb-3">Mobile (later)</p>
                <p className="text-sm text-stone-600 leading-relaxed">
                  A mobile companion app with biometric-gated proof-of-life — one face scan
                  triggers a signed Solana transaction. Zero friction, maximum security.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-stone-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline gap-3 mb-14">
            <span className="text-[10px] font-bold text-amber-500 tracking-widest uppercase">06 / Security</span>
            <h2 className="text-3xl font-bold text-white tracking-tight">Trust Model</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
            {[
              {
                title: "No Admin Key",
                desc: "The deployed program has no upgrade authority. Once live, the code is immutable. No team wallet can alter rules or drain vaults.",
                tag: "IMMUTABLE",
              },
              {
                title: "Zero Custody",
                desc: "Tokens never touch a team wallet. They move directly: owner → vault PDA → nominee. The program only authorizes — it never holds.",
                tag: "NON-CUSTODIAL",
              },
              {
                title: "Anchor Framework",
                desc: "Built with Anchor 0.32. Account constraints (`has_one`, `seeds`, `close`) are enforced at the instruction level — no manual signer checks needed.",
                tag: "ANCHOR 0.32",
              },
              {
                title: "Immutable Nominee",
                desc: "The nominee address is set at vault creation and baked into the PDA. No instruction exists to update it. Verified via `has_one` on every claim.",
                tag: "ON-CHAIN VERIFIED",
              },
              {
                title: "Privilege Escalation Guards",
                desc: "All mutable accounts in each instruction are explicitly declared with `#[account(mut)]`. The Solana runtime rejects any attempt to write to undeclared accounts.",
                tag: "RUNTIME ENFORCED",
              },
              {
                title: "Open Source",
                desc: "Full program source is public. Anyone can audit `claim.rs`, verify the Kamino CPI, inspect the PDA seeds, and reproduce the build.",
                tag: "AUDITABLE",
              },
            ].map((item) => (
              <div key={item.title} className="bg-stone-900 border border-stone-700 rounded-xl p-6">
                <span className="inline-block text-[9px] font-mono font-bold text-amber-500 tracking-widest uppercase bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded mb-4">
                  {item.tag}
                </span>
                <h3 className="text-sm font-bold text-white mb-2">{item.title}</h3>
                <p className="text-xs text-stone-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Program address */}
          <div className="border border-stone-700 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-stone-500 tracking-widest uppercase mb-1">Devnet Program Address</p>
              <p className="text-sm font-mono text-amber-400">{PROGRAM_ID}</p>
            </div>
            <a
              href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 border border-stone-600 hover:border-amber-500 text-stone-400 hover:text-amber-400 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              View on Explorer →
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      {connected && (
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto border border-stone-200 bg-white rounded-xl p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold text-stone-900 mb-1 tracking-tight">Ready to commit?</h2>
              <p className="text-stone-500 text-sm">Set up your vault in under a minute. No personal data. No account.</p>
            </div>
            <Link href="/create" className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 px-10 rounded-lg transition-colors text-sm tracking-wide">
              Create Your Vault
            </Link>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-stone-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-start gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">LP</span>
            </div>
            <span className="text-sm font-bold text-stone-900">Aegis Vault</span>
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
