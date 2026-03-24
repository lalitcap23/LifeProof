"use client";

import { FC, useEffect, useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { VaultCard } from "@/components";
import { getVaultPda } from "@/lib/utils";
import { PROGRAM_ID } from "@/lib/constants";

interface VaultData {
  owner: string;
  nominee: string;
  stakeAmount: bigint;
  checkinInterval: bigint;
  lastCheckin: bigint;
  deadline: bigint;
  isActive: boolean;
}

export default function Dashboard() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [vault, setVault] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVault = useCallback(async () => {
    if (!publicKey || !PROGRAM_ID) return;

    setLoading(true);
    setError(null);

    try {
      const [vaultPda] = getVaultPda(publicKey);
      const accountInfo = await connection.getAccountInfo(vaultPda);

      if (accountInfo) {
        // Parse vault data (8 byte discriminator + account data)
        const data = accountInfo.data;
        if (data.length >= 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1) {
          const owner = new PublicKey(data.slice(8, 40)).toBase58();
          const nominee = new PublicKey(data.slice(40, 72)).toBase58();
          const stakeAmount = data.readBigUInt64LE(72);
          const checkinInterval = data.readBigUInt64LE(80);
          const lastCheckin = data.readBigInt64LE(88);
          const deadline = data.readBigInt64LE(96);
          const isActive = data[104] === 1;

          setVault({
            owner,
            nominee,
            stakeAmount,
            checkinInterval,
            lastCheckin,
            deadline,
            isActive,
          });
        }
      } else {
        setVault(null);
      }
    } catch (err) {
      console.error("Error fetching vault:", err);
      setError("Failed to fetch vault data");
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchVault();
    }
  }, [connected, publicKey, fetchVault]);

  const handleProofOfLife = async () => {
    // TODO: Implement proof of life transaction
    console.log("Proof of life");
    alert("Proof of Life transaction - coming soon!");
  };

  const handleClose = async () => {
    // TODO: Implement close vault transaction
    console.log("Close vault");
    alert("Close Vault transaction - coming soon!");
  };

  const handleClaim = async () => {
    // TODO: Implement claim transaction
    console.log("Claim");
    alert("Claim transaction - coming soon!");
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
            onClick={fetchVault}
            className="text-gray-400 hover:text-white text-sm flex items-center gap-2 transition-colors"
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
