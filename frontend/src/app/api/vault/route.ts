import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

const getConnection = () => {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet");
  return new Connection(endpoint, "confirmed");
};

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "";

const getVaultPda = (owner: PublicKey): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const owner = searchParams.get("owner");

  if (!owner) {
    return NextResponse.json({ error: "Owner address required" }, { status: 400 });
  }

  try {
    const ownerPubkey = new PublicKey(owner);
    const connection = getConnection();
    const [vaultPda] = getVaultPda(ownerPubkey);

    const accountInfo = await connection.getAccountInfo(vaultPda);

    if (!accountInfo) {
      return NextResponse.json({ vault: null });
    }

    const data = accountInfo.data;
    if (data.length < 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1) {
      return NextResponse.json({ error: "Invalid vault data" }, { status: 500 });
    }

    const vaultOwner = new PublicKey(data.slice(8, 40)).toBase58();
    const nominee = new PublicKey(data.slice(40, 72)).toBase58();
    const stakeAmount = data.readBigUInt64LE(72).toString();
    const checkinInterval = data.readBigUInt64LE(80).toString();
    const lastCheckin = data.readBigInt64LE(88).toString();
    const deadline = data.readBigInt64LE(96).toString();
    const isActive = data[104] === 1;

    return NextResponse.json({
      vault: {
        address: vaultPda.toBase58(),
        owner: vaultOwner,
        nominee,
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
