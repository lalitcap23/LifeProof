import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export const getVaultPda = (owner: PublicKey): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
};

export const formatTimeRemaining = (deadline: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = deadline - now;

  if (remaining <= 0) return "Expired";

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const lamportsToSol = (lamports: number | bigint): number => {
  return Number(lamports) / 1e9;
};

export const solToLamports = (sol: number): bigint => {
  return BigInt(Math.floor(sol * 1e9));
};
