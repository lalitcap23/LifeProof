"use client";

import { useState } from "react";
import Link from "next/link";
import { VaultCard } from "@/components";
import { useProofPol, type VaultData } from "@/hooks/useProofPol";

export default function Dashboard() {
  const {
    vaults,
    loading,
    error,
    connected,
    publicKey,
    proofOfLife,
    closeVault,
    claimVault,
    refetch,
  } = useProofPol();

  const [activeVaultAddress, setActiveVaultAddress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setActionError(null);
    setSuccessMessage(null);
  };

  const withVaultAction = async (
    vault: VaultData,
    action: () => Promise<string>,
    successLabel: string
  ) => {
    clearMessages();
    setActiveVaultAddress(vault.address);
    try {
      const signature = await action();
      setSuccessMessage(
        `${successLabel} for vault #${vault.vaultId.toString()}! Tx: ${signature.slice(0, 8)}...`
      );
    } catch (err) {
      console.error(`${successLabel} error:`, err);
      setActionError(
        err instanceof Error ? err.message : `Failed to ${successLabel.toLowerCase()}`
      );
    } finally {
      setActiveVaultAddress(null);
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-stone-900 mb-2">Connect Your Wallet</h1>
          <p className="text-sm text-stone-500">
            Please connect your wallet to view your dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">

        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-amber-600 tracking-widest uppercase mb-1">
              Your Vaults
            </p>
            <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Dashboard</h1>
            <p className="text-sm text-stone-500 mt-1">Manage your commitment vaults</p>
          </div>
          <Link
            href="/create"
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-colors"
          >
            + New Vault
          </Link>
        </div>

        {/* Toast messages */}
        {actionError && (
          <div className="mb-5 bg-white border border-red-200 rounded-xl p-4 flex justify-between items-start gap-4">
            <div className="flex gap-3 items-start">
              <span className="text-red-500 mt-0.5 text-sm font-bold">✕</span>
              <p className="text-sm text-stone-800">{actionError}</p>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-stone-400 hover:text-stone-700 text-xs shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {successMessage && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-start gap-4">
            <div className="flex gap-3 items-start">
              <span className="text-amber-600 mt-0.5 text-sm font-bold">✓</span>
              <p className="text-sm text-amber-900">{successMessage}</p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-amber-400 hover:text-amber-700 text-xs shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-200 border-t-amber-600" />
              <p className="text-sm text-stone-400">Loading vaults…</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white border border-stone-200 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-600">{error}</p>
          </div>
        ) : vaults.length > 0 ? (
          <div className="space-y-4">
            {vaults.map((vault) => (
              <VaultCard
                key={vault.address}
                vaultId={vault.vaultId}
                mint={vault.mint}
                owner={vault.owner}
                nominee={vault.nominee}
                stakeAmount={vault.stakeAmount}
                deadline={Number(vault.deadline)}
                isActive={vault.isActive}
                isOwner={vault.owner === publicKey?.toBase58()}
                onProofOfLife={() =>
                  withVaultAction(
                    vault,
                    () => proofOfLife(vault.address),
                    "Proof of life submitted"
                  )
                }
                onClose={() =>
                  withVaultAction(
                    vault,
                    () => closeVault({ mint: vault.mint, vaultAddress: vault.address }),
                    "Vault closed"
                  )
                }
                onClaim={() =>
                  withVaultAction(
                    vault,
                    () =>
                      claimVault({
                        ownerAddress: vault.owner,
                        nomineeAddress: vault.nominee,
                        mintAddress: vault.mint,
                        vaultAddress: vault.address,
                      }),
                    "Stake claimed"
                  )
                }
                loading={activeVaultAddress === vault.address}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-14 text-center border border-dashed border-stone-200">
            <div className="w-14 h-14 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center mx-auto mb-5">
              <svg
                className="w-7 h-7 text-stone-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-stone-900 mb-1">No Vaults Found</h2>
            <p className="text-sm text-stone-400 mb-6">
              You haven&apos;t created a commitment vault yet.
            </p>
            <Link
              href="/create"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2.5 px-6 rounded-lg transition-colors"
            >
              Create Your First Vault
            </Link>
          </div>
        )}

        {/* Refresh */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={refetch}
            disabled={loading || activeVaultAddress !== null}
            className="text-stone-400 hover:text-stone-700 disabled:opacity-30 text-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>

        {/* Protocol info */}
        <div className="mt-16 border-t border-stone-200 pt-10">
          <p className="text-[10px] font-bold text-stone-400 tracking-widest uppercase mb-5">Protocol Reference</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                tag: "CHECKIN",
                title: "Proof of Life",
                desc: "Sign `proof_of_life` before your deadline to roll it forward. On mainnet your Kamino yield continues to compound.",
              },
              {
                tag: "GRACE PERIOD",
                title: "48h Buffer",
                desc: "After a missed deadline, a 48-hour grace window gives you one last chance before the vault becomes claimable by anyone.",
              },
              {
                tag: "KAMINO",
                title: "Yield on Mainnet",
                desc: "Deposited tokens are routed into Kamino reserves and represented as kTokens in your vault. Yield redeems automatically on claim or close.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white border border-stone-200 rounded-xl p-5">
                <span className="inline-block text-[9px] font-mono font-bold text-amber-600 tracking-widest bg-amber-50 border border-amber-100 px-2 py-0.5 rounded mb-3">
                  {item.tag}
                </span>
                <p className="text-xs font-bold text-stone-900 mb-1.5">{item.title}</p>
                <p className="text-xs text-stone-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
