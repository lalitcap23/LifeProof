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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-black mb-2">Connect Your Wallet</h1>
          <p className="text-sm text-gray-500">
            Please connect your wallet to view your dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black tracking-tight">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your commitment vaults</p>
          </div>
          <Link
            href="/create"
            className="bg-black hover:bg-gray-800 text-white text-sm font-medium py-2.5 px-5 rounded-lg transition-colors"
          >
            + New Vault
          </Link>
        </div>

        {/* Toast messages */}
        {actionError && (
          <div className="mb-5 bg-white border border-gray-900 rounded-xl p-4 flex justify-between items-start gap-4">
            <div className="flex gap-3 items-start">
              <span className="text-black mt-0.5 text-sm">✕</span>
              <p className="text-sm text-black">{actionError}</p>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-gray-400 hover:text-black text-xs shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {successMessage && (
          <div className="mb-5 bg-gray-950 border border-gray-900 rounded-xl p-4 flex justify-between items-start gap-4">
            <div className="flex gap-3 items-start">
              <span className="text-white mt-0.5 text-sm">✓</span>
              <p className="text-sm text-white">{successMessage}</p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-gray-400 hover:text-white text-xs shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-black" />
              <p className="text-sm text-gray-400">Loading vaults…</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
            <p className="text-sm text-gray-600">{error}</p>
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
          <div className="bg-gray-50 rounded-2xl p-12 text-center border border-dashed border-gray-200">
            <div className="w-14 h-14 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg
                className="w-7 h-7 text-gray-300"
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
            <h2 className="text-lg font-semibold text-black mb-1">No Vaults Found</h2>
            <p className="text-sm text-gray-400 mb-6">
              You haven&apos;t created a commitment vault yet.
            </p>
            <Link
              href="/create"
              className="inline-block bg-black hover:bg-gray-800 text-white text-sm font-medium py-2.5 px-6 rounded-lg transition-colors"
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
            className="text-gray-400 hover:text-black disabled:opacity-30 text-sm flex items-center gap-2 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
      </div>
    </div>
  );
}
