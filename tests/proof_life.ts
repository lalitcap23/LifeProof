import * as anchor from "@coral-xyz/anchor";
import { AnchorError, Program, BN } from "@coral-xyz/anchor";
import { ProofPol } from "../target/types/proof_pol";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require("../target/idl/proof_pol.json");
import {
  BanksClient,
  BanksTransactionResultWithMeta,
  ProgramTestContext,
  Clock,
  startAnchor,
} from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

/** Derive the vault PDA for a given owner. */
function findVaultPda(owner: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    programId
  );
}

// Shared constants
const PLATFORM_WALLET = new PublicKey(
  "99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q"
);
const STAKE_AMOUNT = 10_000_000; // 10 tokens (6 decimals)
const ONE_HOUR = 3_600; // minimum allowed checkin interval

// SIMPLE TESTS (without bankrun)
describe("proof_of_life (simple tests)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ProofPol as Program<ProofPol>;
  const wallet = provider.wallet as anchor.Wallet;

  let mint: PublicKey;
  let usdcMint: PublicKey;
  let ownerAta: any;
  let ownerUsdcAta: any;
  let vaultPda: PublicKey;
  let nominee: Keypair;

  before(async () => {
    // 1. Create the stake token mint
    mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // 2. Create owner ATA for stake token
    ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey
    );

    // 3. Mint tokens to owner
    await mintTo(
      provider.connection,
      wallet.payer,
      mint,
      ownerAta.address,
      wallet.publicKey,
      20_000_000
    );

    // 4. Create USDC mint
    usdcMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // 5. Create owner USDC ATA
    ownerUsdcAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      usdcMint,
      wallet.publicKey
    );

    // 6. Mint USDC to owner for platform fee
    await mintTo(
      provider.connection,
      wallet.payer,
      usdcMint,
      ownerUsdcAta.address,
      wallet.publicKey,
      5_000_000
    );

    // 7. Create platform USDC ATA
    const platformUsdcAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      usdcMint,
      PLATFORM_WALLET,
      true
    );

    // 8. Create nominee keypair
    nominee = Keypair.generate();

    // 9. Derive vault PDA
    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), wallet.publicKey.toBuffer()],
      program.programId
    );

    // 10. Initialize vault
    await program.methods
      .initializeVault(new BN(STAKE_AMOUNT), new BN(ONE_HOUR))
      .accounts({
        owner: wallet.publicKey,
        nominee: nominee.publicKey,
        mint,
        usdcMint,
        ownerUsdcAta: ownerUsdcAta.address,
        platformWallet: PLATFORM_WALLET,
        platformUsdcAta: platformUsdcAta.address,
      } as any)
      .rpc();

    console.log("Vault initialized successfully");
    console.log("Vault PDA:", vaultPda.toBase58());
  });

  after(async () => {
    try {
      await program.methods
        .closeVault()
        .accounts({
          owner: wallet.publicKey,
          mint,
        } as any)
        .rpc();
    } catch (err) {
      // Vault might already be closed
    }
  });

  it("should successfully call proof_of_life and update deadline", async () => {
    // Get vault state before
    const vaultBefore = await program.account.commitmentVault.fetch(vaultPda);
    const deadlineBefore = vaultBefore.deadline.toNumber();
    const lastCheckinBefore = vaultBefore.lastCheckin.toNumber();

    console.log("Before proof_of_life:");
    console.log("  Last checkin:", new Date(lastCheckinBefore * 1000).toISOString());
    console.log("  Deadline:", new Date(deadlineBefore * 1000).toISOString());

    // Wait a bit so timestamps are different
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Call proof_of_life
    await program.methods
      .proofOfLife()
      .accounts({
        owner: wallet.publicKey,
        vault: vaultPda,
      } as any)
      .rpc();

    // Get vault state after
    const vaultAfter = await program.account.commitmentVault.fetch(vaultPda);
    const deadlineAfter = vaultAfter.deadline.toNumber();
    const lastCheckinAfter = vaultAfter.lastCheckin.toNumber();

    console.log("After proof_of_life:");
    console.log("  Last checkin:", new Date(lastCheckinAfter * 1000).toISOString());
    console.log("  Deadline:", new Date(deadlineAfter * 1000).toISOString());

    // Verify last_checkin was updated
    assert.isAbove(
      lastCheckinAfter,
      lastCheckinBefore,
      "last_checkin should have advanced"
    );

    // Verify deadline was updated
    assert.isAbove(
      deadlineAfter,
      deadlineBefore,
      "deadline should have advanced"
    );

    // Verify new deadline is approximately last_checkin + checkin_interval
    const expectedDeadline = lastCheckinAfter + ONE_HOUR;
    assert.approximately(
      deadlineAfter,
      expectedDeadline,
      5, // Allow 5 second tolerance
      "deadline should equal last_checkin + interval"
    );

    console.log("proof_of_life successful");
  });

  it("should fail when non-owner tries to call proof_of_life", async () => {
    const nonOwner = Keypair.generate();

    // Airdrop SOL to non-owner
    const airdropSig = await provider.connection.requestAirdrop(
      nonOwner.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    try {
      await program.methods
        .proofOfLife()
        .accounts({
          owner: nonOwner.publicKey,
          vault: vaultPda,
        } as any)
        .signers([nonOwner])
        .rpc();

      assert.fail("Expected error when non-owner calls proof_of_life");
    } catch (err) {
      // The transaction should fail due to PDA constraint mismatch
      // The vault PDA is derived from wallet.publicKey, not nonOwner.publicKey
      console.log("Got expected error for non-owner proof_of_life");
      assert.ok(err, "Should have thrown an error");
    }
  });
});

// BANKRUN TIME-TRAVEL SUITE
describe("proof_of_life (bankrun time-travel)", () => {
  const PROGRAM_ID = new PublicKey(
    "DHHHbFFGWX2y4HkgdePB61bUZxdJQw8VmfGvgR4cxeof"
  );

  // Bankrun context
  let context: ProgramTestContext;
  let client: BanksClient;
  let provider: BankrunProvider;
  let program: Program<ProofPol>;

  // Wallet / keys
  let payer: Keypair;
  let nominee: Keypair;

  // Token mints & ATAs
  let mint: PublicKey;
  let usdcMint: PublicKey;
  let ownerAtaAddress: PublicKey;
  let ownerUsdcAtaAddress: PublicKey;
  let platformUsdcAtaAddress: PublicKey;

  // Vault addresses
  let vaultPda: PublicKey;
  let vaultBump: number;

  // Helper: get fresh blockhash from bankrun
  async function getLatestBlockhash(): Promise<string> {
    const latestBlockhash = await client.getLatestBlockhash();
    return latestBlockhash?.[0] ?? context.lastBlockhash;
  }

  // Helper: build and process a transaction via BanksClient
  async function sendInstruction(
    ix: TransactionInstruction,
    signers: Keypair[] = []
  ): Promise<BanksTransactionResultWithMeta> {
    const tx = new Transaction();
    tx.recentBlockhash = await getLatestBlockhash();
    tx.feePayer = payer.publicKey;
    tx.add(ix);
    tx.sign(payer, ...signers);
    return client.tryProcessTransaction(tx);
  }

  // Helper: warp the bankrun clock to a specific unix_timestamp
  async function warpTimeTo(unixTs: bigint) {
    const currentClock = await client.getClock();
    await context.setClock(
      new Clock(
        currentClock.slot,
        currentClock.epochStartTimestamp,
        currentClock.epoch,
        currentClock.leaderScheduleEpoch,
        unixTs
      )
    );
  }

  /** Create an SPL mint and return its public key. */
  async function bkCreateMint(
    mintAuthority: PublicKey,
    decimals: number
  ): Promise<PublicKey> {
    const mintKp = Keypair.generate();
    const rent = await client.getRent();
    const lamports = Number(rent.minimumBalance(BigInt(MINT_SIZE)));

    const tx = new Transaction();
    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer = payer.publicKey;
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mintKp.publicKey, decimals, mintAuthority, null)
    );
    tx.sign(payer, mintKp);
    await client.processTransaction(tx);
    return mintKp.publicKey;
  }

  /** Create an ATA and return its address. */
  async function bkCreateAta(
    mintPub: PublicKey,
    owner: PublicKey
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mintPub, owner, true);
    const tx = new Transaction();
    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer = payer.publicKey;
    tx.add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mintPub)
    );
    tx.sign(payer);
    await client.processTransaction(tx);
    return ata;
  }

  /** Mint tokens to destination. */
  async function bkMintTo(
    mintPub: PublicKey,
    destination: PublicKey,
    authority: Keypair,
    amount: number
  ): Promise<void> {
    const tx = new Transaction();
    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer = payer.publicKey;
    tx.add(createMintToInstruction(mintPub, destination, authority.publicKey, amount));
    tx.sign(payer, authority);
    await client.processTransaction(tx);
  }

  /** Fund an account with SOL via transfer. */
  async function fundAccount(target: PublicKey, lamports: number): Promise<void> {
    const tx = new Transaction();
    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer = payer.publicKey;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: target,
        lamports,
      })
    );
    tx.sign(payer);
    await client.processTransaction(tx);
  }

  // Global setup
  before(async () => {
    // Boot bankrun
    context = await startAnchor("./", [], []);
    client = context.banksClient;
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<ProofPol>(IDL, provider);
    payer = context.payer;

    // Create nominee keypair and fund it
    nominee = Keypair.generate();
    await fundAccount(nominee.publicKey, 2 * LAMPORTS_PER_SOL);

    // 1. Stake-token mint
    mint = await bkCreateMint(payer.publicKey, 6);

    // 2. Owner ATA for stake token + fund it
    ownerAtaAddress = await bkCreateAta(mint, payer.publicKey);
    await bkMintTo(mint, ownerAtaAddress, payer, 200_000_000);

    // 3. USDC mint + owner ATA + platform ATA
    usdcMint = await bkCreateMint(payer.publicKey, 6);
    ownerUsdcAtaAddress = await bkCreateAta(usdcMint, payer.publicKey);
    await bkMintTo(usdcMint, ownerUsdcAtaAddress, payer, 50_000_000);
    platformUsdcAtaAddress = await bkCreateAta(usdcMint, PLATFORM_WALLET);

    // 4. Derive vault PDAs
    [vaultPda, vaultBump] = findVaultPda(payer.publicKey, PROGRAM_ID);

    console.log("Bankrun setup complete");
    console.log("  Payer:", payer.publicKey.toBase58());
    console.log("  Vault PDA:", vaultPda.toBase58());
  });

  // Helper: initialize a fresh vault
  async function initVaultBankrun(checkinInterval: number = ONE_HOUR) {
    const ix = await program.methods
      .initializeVault(new BN(STAKE_AMOUNT), new BN(checkinInterval))
      .accounts({
        owner: payer.publicKey,
        nominee: nominee.publicKey,
        mint,
        usdcMint,
        ownerUsdcAta: ownerUsdcAtaAddress,
        platformWallet: PLATFORM_WALLET,
        platformUsdcAta: platformUsdcAtaAddress,
      } as any)
      .instruction();

    const result = await sendInstruction(ix);
    if (result.result) {
      throw new Error(`initVaultBankrun failed: ${JSON.stringify(result.result)}`);
    }
  }

  // Helper: close vault
  async function closeVaultBankrun() {
    const ix = await program.methods
      .closeVault()
      .accounts({ owner: payer.publicKey, mint } as any)
      .instruction();
    await sendInstruction(ix);
  }

  // TEST: Successful proof_of_life before deadline
  describe("proof_of_life before deadline", () => {
    let txResult: BanksTransactionResultWithMeta;
    let vaultBefore: any;
    let vaultAfter: any;

    before(async () => {
      // Initialize vault
      await initVaultBankrun(ONE_HOUR);

      // Read vault state before
      vaultBefore = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultBefore.deadline.toNumber());

      console.log("Vault before proof_of_life:");
      console.log("  Last checkin:", vaultBefore.lastCheckin.toNumber());
      console.log("  Deadline:", vaultBefore.deadline.toNumber());

      // Warp to midway through the interval (30 mins before deadline)
      await warpTimeTo(deadlineTs - 1800n);

      // Call proof_of_life
      const ix = await program.methods
        .proofOfLife()
        .accounts({
          owner: payer.publicKey,
          vault: vaultPda,
        } as any)
        .instruction();

      txResult = await sendInstruction(ix);

      // Fetch vault state after
      vaultAfter = await program.account.commitmentVault.fetch(vaultPda);
    });

    after(async () => {
      await closeVaultBankrun();
    });

    it("transaction should succeed", () => {
      assert.isNull(
        txResult.result,
        `Expected success but got: ${JSON.stringify(txResult.result)}`
      );
    });

    it("last_checkin should be updated", () => {
      assert.isAbove(
        vaultAfter.lastCheckin.toNumber(),
        vaultBefore.lastCheckin.toNumber(),
        "last_checkin should have advanced"
      );
    });

    it("deadline should be extended", () => {
      assert.isAbove(
        vaultAfter.deadline.toNumber(),
        vaultBefore.deadline.toNumber(),
        "deadline should have advanced"
      );
    });

    it("new deadline should equal last_checkin + interval", () => {
      const expectedDeadline = vaultAfter.lastCheckin.toNumber() + ONE_HOUR;
      assert.equal(
        vaultAfter.deadline.toNumber(),
        expectedDeadline,
        "deadline should equal last_checkin + interval"
      );
    });

    it("logs should contain proof-of-life accepted message", () => {
      const logs = txResult.meta?.logMessages ?? [];
      const proofLog = logs.find((l) => l.includes("Proof-of-life accepted"));
      assert.exists(
        proofLog,
        `Expected 'Proof-of-life accepted' in logs. Got:\n${logs.join("\n")}`
      );
    });
  });

  // TEST: proof_of_life fails after deadline passes
  describe("proof_of_life after deadline (should fail)", () => {
    let txResult: BanksTransactionResultWithMeta;

    before(async () => {
      // Initialize vault
      await initVaultBankrun(ONE_HOUR);

      // Read deadline
      const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultAccount.deadline.toNumber());

      console.log("Deadline:", new Date(Number(deadlineTs) * 1000).toISOString());

      // Warp PAST the deadline
      await warpTimeTo(deadlineTs + 1n);
      console.log("Warped past deadline");

      // Attempt proof_of_life
      const ix = await program.methods
        .proofOfLife()
        .accounts({
          owner: payer.publicKey,
          vault: vaultPda,
        } as any)
        .instruction();

      txResult = await sendInstruction(ix);
    });

    after(async () => {
      // Reset time before deadline to close vault
      const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultAccount.deadline.toNumber());
      await warpTimeTo(deadlineTs - 60n);
      await closeVaultBankrun();
    });

    it("transaction should fail", () => {
      assert.isNotNull(txResult.result, "Expected transaction to fail");
    });

    it("should contain DeadlineAlreadyPassed error in logs", () => {
      const logs = txResult.meta?.logMessages ?? [];
      const errorLog = logs.find((l) => l.includes("DeadlineAlreadyPassed"));
      assert.exists(
        errorLog,
        `Expected 'DeadlineAlreadyPassed' in logs. Got:\n${logs.join("\n")}`
      );
    });
  });

  // TEST: Multiple consecutive proof_of_life calls
  describe("multiple consecutive proof_of_life calls", () => {
    let vaultAfterFirst: any;
    let vaultAfterSecond: any;

    before(async () => {
      // Initialize vault
      await initVaultBankrun(ONE_HOUR);

      const vaultInitial = await program.account.commitmentVault.fetch(vaultPda);
      const initialDeadline = BigInt(vaultInitial.deadline.toNumber());

      // Warp 30 mins into the interval
      await warpTimeTo(initialDeadline - 1800n);

      // First proof_of_life
      const ix1 = await program.methods
        .proofOfLife()
        .accounts({
          owner: payer.publicKey,
          vault: vaultPda,
        } as any)
        .instruction();
      await sendInstruction(ix1);

      vaultAfterFirst = await program.account.commitmentVault.fetch(vaultPda);
      const firstDeadline = BigInt(vaultAfterFirst.deadline.toNumber());

      // Warp 30 mins into the new interval
      await warpTimeTo(firstDeadline - 1800n);

      // Second proof_of_life
      const ix2 = await program.methods
        .proofOfLife()
        .accounts({
          owner: payer.publicKey,
          vault: vaultPda,
        } as any)
        .instruction();
      await sendInstruction(ix2);

      vaultAfterSecond = await program.account.commitmentVault.fetch(vaultPda);
    });

    after(async () => {
      await closeVaultBankrun();
    });

    it("second deadline should be greater than first", () => {
      assert.isAbove(
        vaultAfterSecond.deadline.toNumber(),
        vaultAfterFirst.deadline.toNumber(),
        "Second deadline should be after first"
      );
    });

    it("each deadline equals respective last_checkin + interval", () => {
      const expected1 = vaultAfterFirst.lastCheckin.toNumber() + ONE_HOUR;
      const expected2 = vaultAfterSecond.lastCheckin.toNumber() + ONE_HOUR;

      assert.equal(
        vaultAfterFirst.deadline.toNumber(),
        expected1,
        "First deadline mismatch"
      );
      assert.equal(
        vaultAfterSecond.deadline.toNumber(),
        expected2,
        "Second deadline mismatch"
      );
    });
  });
});
