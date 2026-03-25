"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  ProofPolClient,
  type CommitmentVault,
  type InitializeVaultParams,
  type ClaimVaultParams,
} from "@/lib/proof-pol/client";

export interface VaultData {
  address: string;
  owner: string;
  nominee: string;
  mint: string;
  stakeAmount: bigint;
  checkinInterval: bigint;
  lastCheckin: bigint;
  deadline: bigint;
  isActive: boolean;
}

/**
 * Hook to interact with the ProofPol program using Codama client
 */
export function useProofPol() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [vault, setVault] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create client instance
  const client = useMemo(() => {
    if (!wallet.publicKey) return null;
    return new ProofPolClient({ connection, wallet });
  }, [connection, wallet]);

  // Convert CommitmentVault to VaultData
  const toVaultData = useCallback(
    (data: CommitmentVault, vaultAddress: string): VaultData => ({
      address: vaultAddress,
      owner: data.owner,
      nominee: data.nominee,
      mint: data.mint,
      stakeAmount: data.stakeAmount,
      checkinInterval: data.checkinInterval,
      lastCheckin: data.lastCheckin,
      deadline: data.deadline,
      isActive: data.isActive,
    }),
    []
  );

  // Fetch vault data
  const fetchVault = useCallback(async () => {
    if (!client || !wallet.publicKey) {
      setVault(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const vaultPda = client.getVaultPda();
      const data = await client.fetchVault();

      if (data) {
        setVault(toVaultData(data, vaultPda.toBase58()));
      } else {
        setVault(null);
      }
    } catch (err) {
      console.error("Error fetching vault:", err);
      setError("Failed to fetch vault data");
      setVault(null);
    } finally {
      setLoading(false);
    }
  }, [client, wallet.publicKey, toVaultData]);

  // Auto-fetch on wallet connect
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      fetchVault();
    } else {
      setVault(null);
    }
  }, [wallet.connected, wallet.publicKey, fetchVault]);

  // Initialize vault
  const initializeVault = useCallback(
    async (params: InitializeVaultParams): Promise<string> => {
      if (!client) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        const signature = await client.initializeVault(params);
        await fetchVault(); // Refresh vault data
        return signature;
      } catch (err: any) {
        const message = err?.message || "Failed to initialize vault";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, fetchVault]
  );

  // Proof of life (check-in)
  const proofOfLife = useCallback(async (): Promise<string> => {
    if (!client) throw new Error("Wallet not connected");

    setLoading(true);
    setError(null);

    try {
      const signature = await client.proofOfLife();
      await fetchVault(); // Refresh vault data
      return signature;
    } catch (err: any) {
      const message = err?.message || "Failed to submit proof of life";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, fetchVault]);

  // Close vault
  const closeVault = useCallback(
    async (mint: string): Promise<string> => {
      if (!client) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        const signature = await client.closeVault(mint);
        await fetchVault(); // Refresh vault data
        return signature;
      } catch (err: any) {
        const message = err?.message || "Failed to close vault";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, fetchVault]
  );

  // Claim vault (for expired vaults)
  const claimVault = useCallback(
    async (params: ClaimVaultParams): Promise<string> => {
      if (!client) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        const signature = await client.claimVault(params);
        return signature;
      } catch (err: any) {
        const message = err?.message || "Failed to claim vault";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  // Get vault PDA for any owner
  const getVaultPda = useCallback(
    (owner?: PublicKey): PublicKey | null => {
      if (!client) return null;
      return client.getVaultPda(owner);
    },
    [client]
  );

  // Fetch vault for any owner
  const fetchVaultFor = useCallback(
    async (owner: PublicKey): Promise<VaultData | null> => {
      if (!client) return null;

      try {
        const data = await client.fetchVault(owner);
        if (data) {
          const vaultPda = client.getVaultPda(owner);
          return toVaultData(data, vaultPda.toBase58());
        }
        return null;
      } catch (err) {
        console.error("Error fetching vault for owner:", err);
        return null;
      }
    },
    [client, toVaultData]
  );

  return {
    // State
    vault,
    loading,
    error,
    connected: wallet.connected,
    publicKey: wallet.publicKey,

    // Actions
    initializeVault,
    proofOfLife,
    closeVault,
    claimVault,
    refetch: fetchVault,

    // Utilities
    getVaultPda,
    fetchVaultFor,
  };
}

// Re-export types
export type { InitializeVaultParams, ClaimVaultParams };
