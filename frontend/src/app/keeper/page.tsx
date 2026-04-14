"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { NATIVE_MINT } from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";
import { ProofPolClient } from "@/lib/proof-pol/client";
import type { VaultAccountData } from "@/lib/proof-pol/client";


/** Must match CLAIM_GRACE_PERIOD in programs/.../constants.rs */
const CLAIM_GRACE_PERIOD = 172_800; // 2 days in seconds


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
  const claimableAt = Number(deadline) + CLAIM_GRACE_PERIOD;
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

  // Client only needs connection for the read; wallet needed only for claim tx
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

  // ── Fetch all claimable vaults (no wallet needed) ──
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

  // ── Execute claim_vault ──
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
          msg: `Done! Tx: ${sig.slice(0, 12)}...  Funds sent to ${truncate(vault.nominee)}`,
        },
      }));

      // Remove the vault from the list after a short delay
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ── */}
      <section className="pt-28 pb-12 px-4 sm:px-6 lg:px-8 border-b border-gray-100">
        <div className="max-w-4xl mx-auto">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
            <span className="text-xs font-medium text-gray-600 tracking-wide uppercase">
              Permissionless Keeper
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-black tracking-tight mb-4">
            Be a Good Samaritan
          </h1>
          <p className="text-base text-gray-500 max-w-2xl leading-relaxed">
            Some vault owners have missed their check-in deadlines. Their nominated
            beneficiaries are waiting for these funds. You can execute the transfer
            right now — trustlessly, on-chain. The protocol ensures funds go{" "}
            <span className="text-black font-medium">only to the nominee</span>, never
            to you.
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 border-b border-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Connect your wallet",
                desc: "Any Solana wallet works. You need it only to sign the transaction.",
              },
              {
                n: "02",
                title: "Click \"Claim for Nominee\"",
                desc: "You call claim_vault. The on-chain program transfers funds directly to the nominee.",
              },
              {
                n: "03",
                title: "Earn vault rent",
                desc: "The vault account's rent (~0.002 SOL) is returned to you as a reward for helping.",
              },
            ].map((step) => (
              <div key={step.n} className="flex gap-4 items-start">
                <div className="w-9 h-9 shrink-0 bg-black text-white rounded-xl flex items-center justify-center text-xs font-bold">
                  {step.n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">{step.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Main content ── */}
      <section className="py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">

          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-black">
                {loading
                  ? "Scanning vaults…"
                  : vaults.length === 0
                  ? "No vaults to claim"
                  : `${vaults.length} vault${vaults.length !== 1 ? "s" : ""} waiting`}
              </h2>
              {!loading && vaults.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  These nominees are waiting for their funds. You can help.
                </p>
              )}
            </div>
            <button
              onClick={fetchClaimable}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black disabled:opacity-30 transition-colors"
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
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-black" />
              <p className="text-sm text-gray-400">Scanning all vaults on-chain…</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && vaults.length === 0 && (
            <div className="bg-gray-50 rounded-2xl p-14 text-center border border-dashed border-gray-200">
              <div className="w-14 h-14 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
                {/* checkmark icon */}
                <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-black mb-1">All caught up</h3>
              <p className="text-sm text-gray-400">
                No vaults are past their claim deadline right now.
                <br />
                Check back later — the clock is always ticking.
              </p>
            </div>
          )}

          {/* Vault cards */}
          {!loading && vaults.length > 0 && (
            <div className="space-y-4">
              {vaults.map((vault) => {
                const result = results[vault.address];
                const isClaiming = claimingAddress === vault.address;

                return (
                  <div
                    key={vault.address}
                    className="bg-white border border-gray-200 hover:border-black rounded-2xl p-6 transition-all duration-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

                      {/* Left — vault info */}
                      <div className="space-y-3 min-w-0 flex-1">

                        {/* Amount + expired badge */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-2xl font-bold text-black">
                            {formatAmount(vault.stakeAmount, vault.mint)}
                          </span>
                          <span className="text-xs bg-black text-white font-medium px-2.5 py-0.5 rounded-full">
                            Claimable
                          </span>
                          <span className="text-xs text-gray-400">
                            Expired {expiredAgo(vault.deadline, now)}
                          </span>
                        </div>

                        {/* Addresses */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium mb-0.5">
                              Owner (missed check-in)
                            </p>
                            <p className="text-xs font-mono text-gray-600 truncate">
                              {vault.owner}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium mb-0.5">
                              Nominee (receives funds)
                            </p>
                            <p className="text-xs font-mono text-black font-semibold truncate">
                              {vault.nominee}
                            </p>
                          </div>
                        </div>

                        {/* Vault address */}
                        <p className="text-[10px] text-gray-300 font-mono">
                          Vault: {vault.address}
                        </p>
                      </div>

                      {/* Right — action */}
                      <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                        <button
                          onClick={() => handleClaim(vault)}
                          disabled={isClaiming || !!result?.ok}
                          className={`
                            min-w-[160px] text-sm font-semibold py-3 px-5 rounded-xl
                            transition-all duration-200
                            ${result?.ok
                              ? "bg-gray-100 text-gray-400 cursor-default"
                              : "bg-black hover:bg-gray-800 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                            }
                          `}
                        >
                          {isClaiming ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-gray-400 border-t-white" />
                              Claiming…
                            </span>
                          ) : result?.ok ? (
                            "✓ Claimed"
                          ) : (
                            "Claim for Nominee"
                          )}
                        </button>

                        {/* Reward note */}
                        {!result && (
                          <p className="text-[10px] text-gray-400 text-right">
                            You earn ~0.002 SOL vault rent
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Result message */}
                    {result && (
                      <div
                        className={`mt-4 rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
                          result.ok
                            ? "bg-gray-950 text-white"
                            : "bg-white border border-gray-900 text-black"
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

          {/* Connect wallet nudge */}
          {!wallet.connected && !loading && vaults.length > 0 && (
            <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-5 text-center">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-black">Connect your wallet</span>{" "}
                to execute the claim transaction. The funds will always go to the nominee,
                not you.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Trust note ── */}
      <section className="py-10 px-4 sm:px-6 lg:px-8 border-t border-gray-100 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-sm font-semibold text-black mb-4">
            Why this is safe
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: "You cannot redirect funds",
                desc: "The nominee address is written into the vault account at creation and verified on-chain. No one can change it.",
              },
              {
                title: "You cannot claim early",
                desc: "The program checks that deadline + 2-day grace period has passed. Any early call is rejected automatically.",
              },
              {
                title: "Fully open-source",
                desc: "The Anchor program is open source. Anyone can audit it. There is no admin key or upgrade authority.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 items-start">
                <div className="w-5 h-5 shrink-0 mt-0.5 rounded-full bg-black flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
