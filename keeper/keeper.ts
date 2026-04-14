import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require("../target/idl/proof_pol.json");

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const POLL_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const CLAIM_GRACE_PERIOD_SECONDS = 172_800;
const KAMINO_LENDING_PROGRAM_ID = new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MINT_WSOL = "So11111111111111111111111111111111111111112";

function loadKeeperKeypair(): Keypair {
  const raw = process.env.KEEPER_KEYPAIR;
  if (!raw) {
    throw new Error(
      "\nKEEPER_KEYPAIR env variable not set.\n" +
      "Generate: solana-keygen new --outfile keeper-wallet.json\n" +
      "Set:      export KEEPER_KEYPAIR=\"$(cat keeper-wallet.json)\"\n"
    );
  }
  try {
    const trimmed = raw.trim();
    const arr: number[] = JSON.parse(trimmed);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    throw new Error(
      "Could not parse KEEPER_KEYPAIR — must be the exact contents of a Solana keypair JSON file:\n" +
      "  one line like [12,45,67,...] (64 numbers). Not base58, not quoted as a string.\n" +
      "Generate: solana-keygen new --outfile keeper-wallet.json\n" +
      "GitHub Secret: paste the entire file body (Repository → Settings → Secrets).\n"
    );
  }
}

function getDevnetKTokenMint(stakeMint: string): string {
  return stakeMint === DEVNET_USDC_MINT ? MINT_WSOL : DEVNET_USDC_MINT;
}

async function claimOneVault(
  program: anchor.Program,
  keeper: Keypair,
  vaultAddress: PublicKey,
  vault: {
    owner: PublicKey;
    nominee: PublicKey;
    mint: PublicKey;
    kTokenMint: PublicKey;
    vaultId: anchor.BN;
  }
): Promise<string> {
  const nomineeAtaPk = getAssociatedTokenAddressSync(vault.mint, vault.nominee, false, TOKEN_PROGRAM_ID);
  const vaultAtaPk = getAssociatedTokenAddressSync(vault.mint, vaultAddress, true, TOKEN_PROGRAM_ID);

  const storedKTokenMint = vault.kTokenMint.toBase58();
  const kTokenMintStr =
    storedKTokenMint === SystemProgram.programId.toBase58()
      ? getDevnetKTokenMint(vault.mint.toBase58())
      : storedKTokenMint;
  const kTokenMintPk = new PublicKey(kTokenMintStr);

  const vaultKTokenAtaPk = getAssociatedTokenAddressSync(kTokenMintPk, vaultAddress, true, TOKEN_PROGRAM_ID);

  const sig = await program.methods
    .claimVault()
    .accounts({
      executor:                     keeper.publicKey,
      nominee:                      vault.nominee,
      owner:                        vault.owner,
      vault:                        vaultAddress,
      mint:                         vault.mint,
      nomineeAta:                   nomineeAtaPk,
      vaultAta:                     vaultAtaPk,
      vaultKTokenAta:               vaultKTokenAtaPk,
      kTokenMint:                   kTokenMintPk,
      kaminoReserve:                SystemProgram.programId,
      kaminoLendingMarket:          SystemProgram.programId,
      kaminoLendingMarketAuthority: SystemProgram.programId,
      kaminoLiquiditySupply:        vaultAtaPk,
      kaminoLendingProgram:         KAMINO_LENDING_PROGRAM_ID,
      instructionSysvar:            SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram:                 TOKEN_PROGRAM_ID,
      associatedTokenProgram:       ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:                SystemProgram.programId,
    } as any)
    .signers([keeper])
    .rpc({ commitment: "confirmed" });

  return sig;
}

async function scanAndClaim(program: anchor.Program, keeper: Keypair): Promise<void> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${new Date().toISOString()}]  Scanning for claimable vaults...`);

  const allVaults = await program.account.commitmentVault.all();
  const activeVaults = allVaults.filter((v) => v.account.isActive);

  console.log(`Found ${allVaults.length} total | ${activeVaults.length} active`);

  if (activeVaults.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  let claimed = 0;
  let waiting = 0;
  let failed = 0;

  for (const { publicKey: vaultAddress, account: vault } of activeVaults) {
    const deadlineTs = (vault.deadline as anchor.BN).toNumber();
    const claimableAt = deadlineTs + CLAIM_GRACE_PERIOD_SECONDS;
    const shortAddr = vaultAddress.toBase58().slice(0, 12) + "...";

    if (nowSeconds < claimableAt) {
      const secondsLeft = claimableAt - nowSeconds;
      console.log(`  WAITING   ${shortAddr}  →  claimable in ${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m`);
      waiting++;
      continue;
    }

    console.log(`  CLAIMING  ${shortAddr}  →  nominee=${vault.nominee.toBase58().slice(0, 12)}...`);

    try {
      const sig = await claimOneVault(program, keeper, vaultAddress, vault as any);
      console.log(`  ✓ SUCCESS  sig=${sig.slice(0, 20)}...  funds sent to ${vault.nominee.toBase58()}`);
      claimed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ FAILED   ${shortAddr}  →  ${msg.split("\n")[0]}`);
      failed++;
    }
  }

  console.log(`\nScan complete.  Claimed: ${claimed}  |  Waiting: ${waiting}  |  Failed: ${failed}`);
  console.log(`Next scan at: ${new Date(Date.now() + POLL_INTERVAL_MS).toISOString()}`);
}

async function main(): Promise<void> {
  const keeper = loadKeeperKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(keeper);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new anchor.Program(IDL, provider);

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     Proof-of-Life Keeper Bot  (DEVNET)       ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`Keeper wallet : ${keeper.publicKey.toBase58()}`);
  console.log(`RPC           : ${RPC_URL}`);
  console.log(`Program       : ${program.programId.toBase58()}`);

  const balance = await connection.getBalance(keeper.publicKey);
  console.log(`Wallet balance: ${(balance / 1_000_000_000).toFixed(6)} SOL`);

  if (balance < 5_000_000) {
    console.warn(`\n⚠  LOW BALANCE — run: solana airdrop 2 ${keeper.publicKey.toBase58()} --url devnet\n`);
  }

  const isCI = process.env.CI === "true" || process.argv.includes("--once");
  console.log(`Mode: ${isCI ? "CI / one-shot" : "server / loop every 2 days"}`);

  await scanAndClaim(program, keeper);

  if (isCI) {
    console.log("\nCI run complete. Exiting.");
    process.exit(0);
  }

  setInterval(async () => {
    try {
      await scanAndClaim(program, keeper);
    } catch (err: unknown) {
      console.error("Scan error:", err instanceof Error ? err.message : String(err));
    }
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
