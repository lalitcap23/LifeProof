import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

const getConnection = () => {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet");
  return new Connection(endpoint, "confirmed");
};

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "";

const u64ToSeed = (value: bigint | number): Uint8Array => {
  const seed = new Uint8Array(8);
  const view = new DataView(seed.buffer);
  view.setBigUint64(0, typeof value === "number" ? BigInt(value) : value, true);
  return seed;
};

const getVaultPda = (
  owner: PublicKey,
  vaultId: bigint | number
): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer(), u64ToSeed(vaultId)],
    new PublicKey(PROGRAM_ID)
  );
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const owner = searchParams.get("owner");
  const vaultId = BigInt(searchParams.get("vaultId") ?? "0");

  if (!owner) {
    return NextResponse.json(
      { error: "Owner address required" },
      { status: 400 }
    );
  }

  try {
    const ownerPubkey = new PublicKey(owner);
    const connection = getConnection();
    const [vaultPda] = getVaultPda(ownerPubkey, vaultId);

    const accountInfo = await connection.getAccountInfo(vaultPda);

    if (!accountInfo) {
      return NextResponse.json({ vault: null });
    }

    const data = accountInfo.data;
    if (data.length < 8 + 32 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1) {
      return NextResponse.json(
        { error: "Invalid vault data" },
        { status: 500 }
      );
    }

    const vaultOwner = new PublicKey(data.slice(8, 40)).toBase58();
    const nominee = new PublicKey(data.slice(48, 80)).toBase58();
    const mint = new PublicKey(data.slice(80, 112)).toBase58();
    const stakeAmount = data.readBigUInt64LE(112).toString();
    const checkinInterval = data.readBigUInt64LE(120).toString();
    const lastCheckin = data.readBigInt64LE(128).toString();
    const deadline = data.readBigInt64LE(136).toString();
    const isActive = data[144] === 1;

    return NextResponse.json({
      vault: {
        address: vaultPda.toBase58(),
        vaultId: vaultId.toString(),
        owner: vaultOwner,
        nominee,
        mint,
        stakeAmount,
        checkinInterval,
        lastCheckin,
        deadline,
        isActive,
      },
    });
  } catch (error) {
    console.error("Error fetching vault:", error);
    return NextResponse.json(
      { error: "Failed to fetch vault" },
      { status: 500 }
    );
  }
}
