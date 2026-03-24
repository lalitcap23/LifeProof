import { Connection, clusterApiUrl } from "@solana/web3.js";

export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "";

export const getConnection = (): Connection => {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet");
  return new Connection(endpoint, "confirmed");
};

export const PLATFORM_WALLET = "99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q";
