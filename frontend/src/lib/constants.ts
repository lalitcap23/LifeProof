import { Connection, clusterApiUrl } from "@solana/web3.js";

export const PROGRAM_ID =
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  "DHHHbFFGWX2y4HkgdePB61bUZxdJQw8VmfGvgR4cxeof";

export const CLUSTER =
  (process.env.NEXT_PUBLIC_CLUSTER as "devnet" | "mainnet-beta" | "testnet") ||
  "devnet";

export const getConnection = (): Connection => {
  const endpoint =
    process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(CLUSTER);
  return new Connection(endpoint, "confirmed");
};

// USDC mint — devnet address is the Circle devnet USDC
export const USDC_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT ||
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Platform wallet that receives 1 USDC fee on vault creation
export const PLATFORM_WALLET =
  process.env.NEXT_PUBLIC_PLATFORM_WALLET ||
  "455q3UD1KkfMP7zWrd2XcYoZW8LaVoiU969cmusengZ9";
