"use client";

import { useState } from "react";
import { VaultCard } from "@/components";
import { useProofPol } from "@/hooks/useProofPol";

export default function Dashboard() {
  const {
    vault,
    loading,
    error,
    connected,
    publicKey,
    proofOfLife,
    closeVault,
    claimVault,
    refetch,
  } = useProofPol();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setActionError(null);
    setSuccessMessage(null);
  };

  const handleProofOfLife = async () => {
    clearMessages();
    setActionLoading(true);
    try {
      const signature = await proofOfLife();
      setSuccessMessage(`Proof of life submitted! Tx: ${signature.slice(0, 8)}...`);
    } catch (err) {
      console.error("Proof of life error:", err);
      setActionError(err instanceof Error ? err.message : "Failed to submit proof of life");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    if (!vault?.mint) {
      setActionError("Vault mint information not available");
      return;
    }
    clearMessages();
    setActionLoading(true);
    try {
      const signature = await closeVault(vault.mint);
      setSuccessMessage(`Vault closed! Tx: ${signature.slice(0, 8)}...`);
    } catch (err) {
      console.error("Close vault error:", err);
      setActionError(err instanceof Error ? err.message : "Failed to close vault");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!vault) {
      setActionError("Vault information not available");
      return;
    }
    clearMessages();
    setActionLoading(true);
    try {
      const signature = await claimVault({
        ownerAddress: vault.owner,
        nomineeAddress: vault.nominee,
        mintAddress: vault.mint,
      });
      setSuccessMessage(`Stake claimed! Tx: ${signature.slice(0, 8)}...`);
    } catch (err) {
      console.error("Claim vault error:", err);
      setActionError(err instanceof Error ? err.message : "Failed to claim vault");
    } finally {
      setActionLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="text-gray-400">
            Please connect your wallet to view your dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-400">Manage your commitment vaults</p>
        </div>

        {/* Action feedback messages */}
        {actionError && (
          <div className="mb-6 bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 flex justify-between items-center">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-300 hover:text-white">
              ✕
            </button>
          </div>
        )}
        {successMessage && (
          <div className="mb-6 bg-green-900/20 border border-green-800 rounded-lg p-4 text-green-400 flex justify-between items-center">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-green-300 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
            {error}
          </div>
        ) : vault ? (
          <div className="grid gap-6">
            <VaultCard
              owner={vault.owner}
              nominee={vault.nominee}
              stakeAmount={vault.stakeAmount}
              deadline={Number(vault.deadline)}
              isActive={vault.isActive}
              isOwner={vault.owner === publicKey?.toBase58()}
              onProofOfLife={handleProofOfLife}
              onClose={handleClose}
              onClaim={handleClaim}
              loading={actionLoading}
            />
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">No Vault Found</h2>
            <p className="text-gray-400 mb-4">
              You haven&apos;t created a commitment vault yet.
            </p>
            <a
              href="/create"
              className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Create Your First Vault
            </a>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <button
            onClick={refetch}
            disabled={loading || actionLoading}
            className="text-gray-400 hover:text-white disabled:opacity-50 text-sm flex items-center gap-2 transition-colors"
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
