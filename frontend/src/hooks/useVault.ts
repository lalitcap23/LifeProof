"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getVaultPda } from "@/lib/utils";
import { PROGRAM_ID } from "@/lib/constants";

export interface VaultData {
  address: string;
  owner: string;
  nominee: string;
  stakeAmount: bigint;
  checkinInterval: bigint;
  lastCheckin: bigint;
  deadline: bigint;
  isActive: boolean;
}

export function useVault() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [vault, setVault] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVault = useCallback(async () => {
    if (!publicKey || !PROGRAM_ID) {
      setVault(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [vaultPda] = getVaultPda(publicKey, 0);
      const accountInfo = await connection.getAccountInfo(vaultPda);

      if (accountInfo) {
        const data = accountInfo.data;
        if (data.length >= 8 + 32 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1) {
          const owner = new PublicKey(data.slice(8, 40)).toBase58();
          const nominee = new PublicKey(data.slice(48, 80)).toBase58();
          const stakeAmount = data.readBigUInt64LE(112);
          const checkinInterval = data.readBigUInt64LE(120);
          const lastCheckin = data.readBigInt64LE(128);
          const deadline = data.readBigInt64LE(136);
          const isActive = data[144] === 1;

          setVault({
            address: vaultPda.toBase58(),
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
      setVault(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchVault();
    } else {
      setVault(null);
    }
  }, [connected, publicKey, fetchVault]);

  return {
    vault,
    loading,
    error,
    refetch: fetchVault,
  };
}
