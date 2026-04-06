"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  ProofPolClient,
  type CommitmentVault,
  type InitializeVaultParams,
  type ClaimVaultParams,
  type CloseVaultParams,
} from "@/lib/proof-pol/client";

export interface VaultData {
  address: string;
  vaultId: bigint;
  owner: string;
  nominee: string;
  mint: string;
  stakeAmount: bigint;
  checkinInterval: bigint;
  lastCheckin: bigint;
  deadline: bigint;
  isActive: boolean;
}

export function useProofPol() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [vaults, setVaults] = useState<VaultData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    if (!wallet.publicKey) return null;
    return new ProofPolClient({ connection, wallet });
  }, [connection, wallet]);

  const toVaultData = useCallback(
    (data: CommitmentVault, vaultAddress: string): VaultData => ({
      address: vaultAddress,
      vaultId: data.vaultId,
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

  const fetchVaults = useCallback(async () => {
    if (!client || !wallet.publicKey) {
      setVaults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const accounts = await client.fetchVaults();
      setVaults(accounts.map((vault) => toVaultData(vault.data, vault.address)));
    } catch (err) {
      console.error("Error fetching vaults:", err);
      setError("Failed to fetch vault data");
      setVaults([]);
    } finally {
      setLoading(false);
    }
  }, [client, wallet.publicKey, toVaultData]);

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      fetchVaults();
    } else {
      setVaults([]);
    }
  }, [wallet.connected, wallet.publicKey, fetchVaults]);

  const initializeVault = useCallback(
    async (params: InitializeVaultParams): Promise<string> => {
      if (!client) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        const signature = await client.initializeVault(params);
        await fetchVaults();
        return signature;
      } catch (err: any) {
        const message = err?.message || "Failed to initialize vault";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, fetchVaults]
  );

  const proofOfLife = useCallback(
    async (vaultAddress: string): Promise<string> => {
      if (!client) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        const signature = await client.proofOfLife(vaultAddress);
        await fetchVaults();
        return signature;
      } catch (err: any) {
        const message = err?.message || "Failed to submit proof of life";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, fetchVaults]
  );

  const closeVault = useCallback(
    async (params: CloseVaultParams): Promise<string> => {
      if (!client) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        const signature = await client.closeVault(params);
        await fetchVaults();
        return signature;
      } catch (err: any) {
        const message = err?.message || "Failed to close vault";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, fetchVaults]
  );

  const claimVault = useCallback(
    async (params: ClaimVaultParams): Promise<string> => {
      if (!client) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        const signature = await client.claimVault(params);
        await fetchVaults();
        return signature;
      } catch (err: any) {
        const message = err?.message || "Failed to claim vault";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, fetchVaults]
  );

  const getVaultPda = useCallback(
    (vaultId: bigint | number, owner?: PublicKey): PublicKey | null => {
      if (!client) return null;
      return client.getVaultPda(vaultId, owner);
    },
    [client]
  );

  const fetchVaultFor = useCallback(
    async (owner: PublicKey, vaultId: bigint | number): Promise<VaultData | null> => {
      if (!client) return null;

      try {
        const vaultPda = client.getVaultPda(vaultId, owner);
        const data = await client.fetchVaultByAddress(vaultPda);
        return data ? toVaultData(data, vaultPda.toBase58()) : null;
      } catch (err) {
        console.error("Error fetching vault for owner:", err);
        return null;
      }
    },
    [client, toVaultData]
  );

  return {
    vault: vaults[0] ?? null,
    vaults,
    loading,
    error,
    connected: wallet.connected,
    publicKey: wallet.publicKey,
    initializeVault,
    proofOfLife,
    closeVault,
    claimVault,
    refetch: fetchVaults,
    getVaultPda,
    fetchVaultFor,
  };
}

export type { InitializeVaultParams, ClaimVaultParams, CloseVaultParams };
