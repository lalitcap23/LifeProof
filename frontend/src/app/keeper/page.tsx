"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { NATIVE_MINT } from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";
import { ProofPolClient } from "@/lib/proof-pol/client";
import type { VaultAccountData } from "@/lib/proof-pol/client";

const CLAIM_GRACE_PERIOD = 172_800;

function formatAmount(stakeAmount: bigint, mint: string): string {
  if (mint === NATIVE_MINT.toBase58())
    return `${(Number(stakeAmount) / 1e9).toFixed(4)} SOL`;
  if (mint === USDC_MINT)
    return `${(Number(stakeAmount) / 1e6).toFixed(2)} USDC`;
  return `${stakeAmount.toString()} units`;
}

function truncate(addr: string, chars = 6): string {
  return `${addr.slice(0, chars)}...${addr.slice(-4)}`;
}

function expiredAgo(deadline: bigint, now: number): string {
  const expired = now - Number(deadline);
  const days = Math.floor(expired / 86400);
  const hours = Math.floor((expired % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h ago`;
  if (hours > 0) return `${hours}h ago`;
  return "Just expired";
}

interface ClaimableVault {
  address: string;
  owner: string;
  nominee: string;
  mint: string;
  stakeAmount: bigint;
  deadline: bigint;
  kTokenMint: string;
}

export default function KeeperPage() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [vaults, setVaults] = useState<ClaimableVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingAddress, setClaimingAddress] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const readClient = useMemo(
    () =>
      new ProofPolClient({
        connection,
        wallet: {
          publicKey: wallet.publicKey ?? null,
          connected: wallet.connected,
          signTransaction: wallet.signTransaction,
          sendTransaction: wallet.sendTransaction,
        } as any,
      }),
    [connection, wallet]
  );

  const fetchClaimable = useCallback(async () => {
    setLoading(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const allActive = await readClient.fetchAllActiveVaults();

      const claimable = allActive
        .filter((v) => {
          const claimableAt = Number(v.data.deadline) + CLAIM_GRACE_PERIOD;
          return now >= claimableAt;
        })
        .map((v) => ({
          address: v.address,
          owner: v.data.owner,
          nominee: v.data.nominee,
          mint: v.data.mint,
          stakeAmount: v.data.stakeAmount,
          deadline: v.data.deadline,
          kTokenMint: v.data.kTokenMint,
        }));

      setVaults(claimable);
    } catch (err) {
      console.error("Failed to fetch claimable vaults:", err);
    } finally {
      setLoading(false);
    }
  }, [readClient]);

  useEffect(() => {
    fetchClaimable();
  }, [fetchClaimable]);

  const handleClaim = async (vault: ClaimableVault) => {
    if (!wallet.connected || !wallet.publicKey) {
      alert("Please connect your wallet first.");
      return;
    }

    setClaimingAddress(vault.address);
    setResults((prev) => {
      const next = { ...prev };
      delete next[vault.address];
      return next;
    });

    try {
      const sig = await readClient.claimVault({
        ownerAddress: vault.owner,
        nomineeAddress: vault.nominee,
        mintAddress: vault.mint,
        vaultAddress: vault.address,
      });

      setResults((prev) => ({
        ...prev,
        [vault.address]: {
          ok: true,
          msg: `Done! Tx: ${sig.slice(0, 12)}…  Funds sent to ${truncate(vault.nominee)}`,
        },
      }));

      setTimeout(() => {
        setVaults((prev) => prev.filter((v) => v.address !== vault.address));
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      setResults((prev) => ({
        ...prev,
        [vault.address]: { ok: false, msg },
      }));
    } finally {
      setClaimingAddress(null);
    }
  };

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">

      {/* ── Dark Hero ── */}
      <section className="bg-stone-950 pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 border border-stone-700 rounded-full px-3 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-stone-400 tracking-widest uppercase">
              Permissionless Keeper
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tighter mb-5 leading-none">
            Be a Good<br />
            <span className="text-amber-500">Samaritan</span>
          </h1>
          <p className="text-base text-stone-400 max-w-2xl leading-relaxed mb-6">
            Some vault owners have missed their check-in deadlines. Their nominated
            beneficiaries are waiting for these funds. You can execute the transfer
            right now — trustlessly, on-chain. Funds go{" "}
            <span className="text-stone-200 font-semibold">only to the nominee</span>, never to you.
          </p>
          {/* Execution guarantee callout */}
          <div className="flex items-start gap-3 bg-stone-900 border border-amber-600/30 rounded-xl p-4 max-w-2xl">
            <span className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0 animate-pulse" />
            <p className="text-sm text-stone-300 leading-relaxed">
              <span className="text-amber-400 font-bold">Automatic execution is guaranteed.</span>{" "}
              Even if no one claims manually, the keeper bot runs every 48 hours on GitHub Actions
              and will execute the transfer. The nominee{" "}
              <span className="text-white font-semibold">always receives their funds</span> —
              you can accelerate it by claiming here and earning the vault rent.
            </p>
          </div>
        </div>
      </section>

      {/* ── Amber strip ── */}
      <div className="bg-amber-600 py-3 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { n: "01", label: "Connect any wallet" },
            { n: "02", label: "Click \"Claim for Nominee\"" },
            { n: "03", label: "Earn ~0.002 SOL vault rent" },
            { n: "🤖", label: "Or keeper bot does it automatically" },
          ].map((s) => (
            <div key={s.n} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/60 shrink-0">{s.n}</span>
              <span className="text-xs font-semibold text-white">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">

          {/* Header row */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-[10px] font-bold text-amber-600 tracking-widest uppercase mb-1">
                Claimable Vaults
              </p>
              <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
                {loading
                  ? "Scanning vaults…"
                  : vaults.length === 0
                  ? "No vaults to claim"
                  : `${vaults.length} vault${vaults.length !== 1 ? "s" : ""} waiting`}
              </h2>
              {!loading && vaults.length > 0 && (
                <p className="text-xs text-stone-400 mt-0.5">
                  These nominees are waiting for their funds. You can help.
                </p>
              )}
            </div>
            <button
              onClick={fetchClaimable}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 disabled:opacity-30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-200 border-t-amber-600" />
              <p className="text-sm text-stone-400">Scanning all vaults on-chain…</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && vaults.length === 0 && (
            <div className="bg-white rounded-xl p-16 text-center border border-dashed border-stone-200">
              <div className="w-14 h-14 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-stone-900 mb-1">All caught up</h3>
              <p className="text-sm text-stone-400">
                No vaults are past their claim deadline right now.
                <br />
                Check back later — the clock is always ticking.
              </p>
            </div>
          )}

          {/* Vault list */}
          {!loading && vaults.length > 0 && (
            <div className="space-y-4">
              {vaults.map((vault) => {
                const result = results[vault.address];
                const isClaiming = claimingAddress === vault.address;

                return (
                  <div
                    key={vault.address}
                    className="bg-white border border-stone-200 hover:border-amber-300 rounded-xl p-6 transition-all duration-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">

                      {/* Left — info */}
                      <div className="space-y-4 min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-2xl font-bold text-stone-900">
                            {formatAmount(vault.stakeAmount, vault.mint)}
                          </span>
                          <span className="text-[10px] bg-amber-600 text-white font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                            Claimable
                          </span>
                          <span className="text-xs text-stone-400">
                            Expired {expiredAgo(vault.deadline, now)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-stone-50 rounded-lg px-3 py-2.5 border border-stone-100">
                            <p className="text-[9px] uppercase tracking-widest text-stone-400 font-bold mb-1">
                              Owner (missed check-in)
                            </p>
                            <p className="text-xs font-mono text-stone-600 truncate">
                              {vault.owner}
                            </p>
                          </div>
                          <div className="bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-100">
                            <p className="text-[9px] uppercase tracking-widest text-amber-600 font-bold mb-1">
                              Nominee (receives funds)
                            </p>
                            <p className="text-xs font-mono text-stone-800 font-semibold truncate">
                              {vault.nominee}
                            </p>
                          </div>
                        </div>

                        <p className="text-[10px] text-stone-300 font-mono">
                          Vault: {vault.address}
                        </p>
                      </div>

                      {/* Right — action */}
                      <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                        <button
                          onClick={() => handleClaim(vault)}
                          disabled={isClaiming || !!result?.ok}
                          className={`
                            min-w-[160px] text-sm font-bold py-3 px-5 rounded-xl
                            transition-all duration-200
                            ${result?.ok
                              ? "bg-stone-100 text-stone-400 cursor-default"
                              : "bg-amber-600 hover:bg-amber-700 text-white disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
                            }
                          `}
                        >
                          {isClaiming ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-amber-300 border-t-white" />
                              Claiming…
                            </span>
                          ) : result?.ok ? (
                            "✓ Claimed"
                          ) : (
                            "Claim for Nominee"
                          )}
                        </button>

                        {!result && (
                          <p className="text-[10px] text-stone-400 text-right">
                            You earn ~0.002 SOL vault rent
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Result */}
                    {result && (
                      <div
                        className={`mt-4 rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
                          result.ok
                            ? "bg-amber-50 border border-amber-200 text-amber-800"
                            : "bg-white border border-red-200 text-red-700"
                        }`}
                      >
                        <span className="shrink-0 font-bold">
                          {result.ok ? "✓" : "✕"}
                        </span>
                        <p>{result.msg}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Connect nudge */}
          {!wallet.connected && !loading && vaults.length > 0 && (
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
              <p className="text-sm text-amber-800">
                <span className="font-bold">Connect your wallet</span>{" "}
                to execute the claim transaction. The funds always go to the nominee, not you.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Technical execution flow ── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-stone-200 bg-stone-950">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline gap-3 mb-10">
            <span className="text-[10px] font-bold text-amber-500 tracking-widest uppercase">On-Chain</span>
            <h3 className="text-xl font-bold text-white tracking-tight">What happens when you click &ldquo;Claim&rdquo;</h3>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Terminal */}
            <div className="bg-stone-900 border border-stone-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-stone-800 border-b border-stone-700 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500/50" />
                  <span className="w-2 h-2 rounded-full bg-amber-500/50" />
                  <span className="w-2 h-2 rounded-full bg-green-500/50" />
                </div>
                <span className="text-stone-500 font-mono text-[10px] ml-1">claim_vault — instruction flow</span>
              </div>
              <div className="p-5 font-mono text-xs space-y-1.5">
                {[
                  { t: "CHECK", v: "vault.is_active == true", c: "text-stone-400" },
                  { t: "CHECK", v: "now >= vault.deadline + 172800", c: "text-stone-400" },
                  { t: "CHECK", v: "vault.nominee == nominee.key()", c: "text-stone-400" },
                  { t: "MAINNET", v: "refresh_reserve (Kamino)", c: "text-amber-500" },
                  { t: "MAINNET", v: "redeem_reserve_collateral (kTokens → USDC)", c: "text-amber-500" },
                  { t: "TRANSFER", v: "vault_ata → nominee_ata (full balance)", c: "text-green-400" },
                  { t: "CLOSE", v: "vault_ata account → rent to caller", c: "text-stone-400" },
                  { t: "CLOSE", v: "vault PDA account → rent to nominee", c: "text-stone-400" },
                  { t: "SET", v: "vault.is_active = false", c: "text-stone-400" },
                ].map((row, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={`shrink-0 w-16 text-[10px] font-bold ${
                      row.t === "MAINNET" ? "text-amber-600" :
                      row.t === "TRANSFER" ? "text-green-600" :
                      row.t === "CHECK" ? "text-stone-600" : "text-stone-600"
                    }`}>{row.t}</span>
                    <span className={row.c}>{row.v}</span>
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t border-stone-800 text-[10px] text-stone-600">
                  All checks are Anchor account constraints — they run before any instruction logic.
                </div>
              </div>
            </div>

            {/* Why it matters */}
            <div className="space-y-4">
              <div className="bg-stone-900 border border-stone-700 rounded-xl p-5">
                <p className="text-[10px] font-bold text-amber-500 tracking-widest uppercase mb-3">Why the caller gets rent</p>
                <p className="text-sm text-stone-400 leading-relaxed">
                  When an account is closed on Solana, its rent is returned to a specified recipient.
                  LifeProof directs the <code className="bg-stone-800 px-1 rounded text-amber-400">vault_ata</code> rent
                  to the caller (keeper). This covers the gas cost of the transaction and any ATA creation fees —
                  making each execution economically neutral or profitable.
                </p>
              </div>
              <div className="bg-stone-900 border border-stone-700 rounded-xl p-5">
                <p className="text-[10px] font-bold text-amber-500 tracking-widest uppercase mb-3">Nominee ATA creation</p>
                <p className="text-sm text-stone-400 leading-relaxed">
                  If the nominee&apos;s token account (ATA) doesn&apos;t exist yet, the keeper creates it using
                  <code className="bg-stone-800 px-1 rounded text-amber-400 mx-1">init_if_needed</code>.
                  The ~0.002 SOL cost is paid by the keeper upfront and fully recovered from the vault rent.
                </p>
              </div>
              <div className="bg-stone-900 border border-stone-700 rounded-xl p-5">
                <p className="text-[10px] font-bold text-amber-500 tracking-widest uppercase mb-3">Kamino redemption (mainnet)</p>
                <p className="text-sm text-stone-400 leading-relaxed">
                  On mainnet, the program calls <code className="bg-stone-800 px-1 rounded text-amber-400">redeem_reserve_collateral</code> —
                  burning all kTokens held in <code className="bg-stone-800 px-1 rounded text-amber-400">vault_ktoken_ata</code> and
                  receiving the full underlying balance plus all accrued yield into <code className="bg-stone-800 px-1 rounded text-amber-400">vault_ata</code>,
                  before the transfer to the nominee.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust section ── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-stone-100 border-t border-stone-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline gap-3 mb-10">
            <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase">Trust Model</span>
            <h3 className="text-xl font-bold text-stone-900 tracking-tight">Why this is safe</h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                tag: "IMMUTABLE",
                title: "You cannot redirect funds",
                desc: "The nominee address is written into the vault PDA at creation. No instruction exists to update it. Every claim verifies it via `has_one = nominee`.",
              },
              {
                tag: "TIME-LOCKED",
                title: "You cannot claim early",
                desc: "The program checks `now >= vault.deadline + 172_800`. Any transaction before that timestamp is rejected by the Anchor runtime — not a UI check.",
              },
              {
                tag: "OPEN SOURCE",
                title: "Fully auditable",
                desc: "Full Anchor source is public. No admin key. No upgrade authority. Anyone can verify that `claim_vault` always transfers to nominee, never to caller.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border border-stone-200">
                <span className="inline-block text-[9px] font-mono font-bold text-amber-600 tracking-widest bg-amber-50 border border-amber-100 px-2 py-0.5 rounded mb-4">
                  {item.tag}
                </span>
                <p className="text-xs font-bold text-stone-900 mb-2 uppercase tracking-wide">{item.title}</p>
                <p className="text-sm text-stone-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
