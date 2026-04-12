import { Connection, clusterApiUrl } from "@solana/web3.js";

export const PROGRAM_ID =
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  "DHHHbFFGWX2y4HkgdePB61bUZxdJQw8VmfGvgR4cxeof";

export const CLUSTER =
  (process.env.NEXT_PUBLIC_CLUSTER as "devnet" | "mainnet-beta" | "testnet") ||
  "devnet";

export const getConnection = (): Connection => {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(CLUSTER);
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

// ---------------------------------------------------------------------------
// Kamino Finance Constants (Mainnet)
// ---------------------------------------------------------------------------
export const KAMINO_LENDING_PROGRAM_ID =
  "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

export const KAMINO_LENDING_MARKET =
  "7u3HeHxYBMx4EXs9BkPtjexbjtZnAebxpHMEteM9wBkA";

export const KAMINO_LENDING_MARKET_AUTHORITY =
  "9DdFPN1h1QTqRJe9tYvWeXhB3A2CjDMWQ1z2Lss594c9";

export const KAMINO_USDC_RESERVE =
  "D6q6wuQVxgTDgtdPfaB6JpW6wPEzB2MAdqEnk4eXm41L";

export const KAMINO_USDC_COLLATERAL_MINT =
  "FgSsGV8jgU542hSBe6A63378L32YJ97sR21c7iTqjX4r";

export const KAMINO_USDC_LIQUIDITY_SUPPLY =
  "AFB3o7wV1iYjJcLZfC4yTzXof7pDEd7z6Rfto6H93EXF";

export const KAMINO_SOL_RESERVE = "d4A2prbA2u7uA8zV3D3x1xWeaH6mEQvY6mDqWmbBq9S";

export const KAMINO_SOL_COLLATERAL_MINT =
  "H9vmCVd3Yv4PxyUty289S1p5D8yK4Y2qXwFvKzK2qHqP";

export const KAMINO_SOL_LIQUIDITY_SUPPLY =
  "HjqokdofYh4tXgChM5a4P2f3R55yBWeBheLhKkE1cM6n";

export const MINT_WSOL = "So11111111111111111111111111111111111111112";
