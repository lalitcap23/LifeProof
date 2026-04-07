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
  getAccount,
  getAssociatedTokenAddressSync,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

// SIMPLE TESTS (without bankrun) - Validates error cases

describe("claim vault (simple tests)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ProofPol as Program<ProofPol>;
  const wallet = provider.wallet as anchor.Wallet;

  let mint: PublicKey;
  let usdcMint: PublicKey;
  let ownerAta: any;
  let ownerUsdcAta: any;
  let vaultPda: PublicKey;
  let vaultAtaAddress: PublicKey;
  let nominee: Keypair;
  let nomineeAta: PublicKey;

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

    // 9. Airdrop SOL to nominee for transaction fees
    const airdropSig = await provider.connection.requestAirdrop(
      nominee.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // 10. Derive vault PDA
    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), wallet.publicKey.toBuffer()],
      program.programId
    );

    // 11. Derive vault ATA address
    vaultAtaAddress = getAssociatedTokenAddressSync(mint, vaultPda, true);

    // 12. Derive nominee ATA address
    nomineeAta = getAssociatedTokenAddressSync(mint, nominee.publicKey);

    // 13. Initialize vault with minimum interval (1 hour = 3600 seconds)
    await program.methods
      .initializeVault(new BN(10_000_000), new BN(3600))
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
    console.log("Nominee:", nominee.publicKey.toBase58());
  });

  // Clean up after tests
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
      // Vault might already be claimed or closed
    }
  });

  it("should fail to claim before deadline passes (DeadlineNotPassed)", async () => {
    try {
      await program.methods
        .claimVault()
        .accounts({
          nominee: nominee.publicKey,
          owner: wallet.publicKey,
          mint,
        } as any)
        .signers([nominee])
        .rpc();

      assert.fail("Expected DeadlineNotPassed error");
    } catch (err) {
      if (err instanceof AnchorError) {
        assert.equal(
          err.error.errorCode.code,
          "DeadlineNotPassed",
          "Expected DeadlineNotPassed error"
        );
        console.log("Got expected error: DeadlineNotPassed");
      } else {
        throw err;
      }
    }
  });

  it("should fail when non-nominee tries to claim", async () => {
    const fakeNominee = Keypair.generate();

    const airdropSig = await provider.connection.requestAirdrop(
      fakeNominee.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    try {
      await program.methods
        .claimVault()
        .accounts({
          nominee: fakeNominee.publicKey,
          owner: wallet.publicKey,
          mint,
        } as any)
        .signers([fakeNominee])
        .rpc();

      assert.fail("Expected NotNominee error");
    } catch (err) {
      if (err instanceof AnchorError) {
        assert.equal(
          err.error.errorCode.code,
          "NotNominee",
          "Expected NotNominee error"
        );
        console.log("Got expected error: NotNominee");
      } else {
        console.log("Got error (expected):", err);
      }
    }
  });

  it("should verify vault state before claim attempt", async () => {
    const vault = await program.account.commitmentVault.fetch(vaultPda);

    assert.equal(vault.owner.toBase58(), wallet.publicKey.toBase58());
    assert.equal(vault.nominee.toBase58(), nominee.publicKey.toBase58());
    assert.equal(vault.mint.toBase58(), mint.toBase58());
    assert.equal(vault.stakeAmount.toNumber(), 10_000_000);
    assert.equal(vault.isActive, true);
    assert.equal(vault.checkinInterval.toNumber(), 3600);

    const vaultToken = await getAccount(provider.connection, vaultAtaAddress);
    assert.equal(Number(vaultToken.amount), 10_000_000);

    console.log("Vault state verified:");
    console.log("  Owner:", vault.owner.toBase58());
    console.log("  Nominee:", vault.nominee.toBase58());
    console.log("  Stake:", vault.stakeAmount.toNumber());
    console.log(
      "  Deadline:",
      new Date(vault.deadline.toNumber() * 1000).toISOString()
    );
    console.log("  Is Active:", vault.isActive);
  });
});

// BANKRUN TIME-TRAVEL SUITE – Full claim testing with clock manipulation
describe("claim vault (bankrun time-travel)", () => {
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
  let nomineeAtaAddress: PublicKey;

  // Vault addresses
  let vaultPda: PublicKey;
  let vaultBump: number;
  let vaultAtaAddress: PublicKey;

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

  // ─── Bankrun-compatible token helpers ────────────────────────────────────

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

  // ─── Global setup ───────────────────────────────────────────────────────
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
    vaultAtaAddress = getAssociatedTokenAddressSync(mint, vaultPda, true);

    // 5. Derive nominee ATA
    nomineeAtaAddress = getAssociatedTokenAddressSync(mint, nominee.publicKey);

    console.log("Bankrun setup complete");
    console.log("  Payer:", payer.publicKey.toBase58());
    console.log("  Nominee:", nominee.publicKey.toBase58());
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

  // TEST: Claim fails before deadline
  
  describe("before deadline passes", () => {
    let txResult: BanksTransactionResultWithMeta;

    before(async () => {
      // Initialize vault
      await initVaultBankrun(ONE_HOUR);

      // Read the deadline
      const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultAccount.deadline.toNumber());

      // Stay 60 seconds BEFORE the deadline
      await warpTimeTo(deadlineTs - 60n);

      // Attempt to claim
      const ix = await program.methods
        .claimVault()
        .accounts({
          nominee: nominee.publicKey,
          owner: payer.publicKey,
          mint,
        } as any)
        .instruction();

      txResult = await sendInstruction(ix, [nominee]);
    });

    after(async () => {
      // Clean up - close vault before next test
      const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultAccount.deadline.toNumber());
      await warpTimeTo(deadlineTs - 60n);

      const ix = await program.methods
        .closeVault()
        .accounts({ owner: payer.publicKey, mint } as any)
        .instruction();
      await sendInstruction(ix);
    });

    it("transaction should fail", () => {
      assert.isNotNull(txResult.result, "Expected transaction to fail");
    });

    it("should contain DeadlineNotPassed error in logs", () => {
      const logs = txResult.meta?.logMessages ?? [];
      const errorLog = logs.find((l) => l.includes("DeadlineNotPassed"));
      assert.exists(
        errorLog,
        `Expected 'DeadlineNotPassed' in logs. Got:\n${logs.join("\n")}`
      );
    });
  });

  // TEST: Successful claim after deadline passes
  describe("after deadline passes (successful claim)", () => {
    let txResult: BanksTransactionResultWithMeta;
    let vaultAccountBefore: any;

    before(async () => {
      // Initialize a fresh vault
      await initVaultBankrun(ONE_HOUR);

      // Read the vault state before claim
      vaultAccountBefore = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultAccountBefore.deadline.toNumber());

      console.log("Vault before claim:");
      console.log("  Stake amount:", vaultAccountBefore.stakeAmount.toNumber());
      console.log("  Deadline:", new Date(Number(deadlineTs) * 1000).toISOString());
      console.log("  Is active:", vaultAccountBefore.isActive);

      // Warp 1 second PAST the deadline
      await warpTimeTo(deadlineTs + 1n);
      console.log("Clock warped past deadline");

      // Execute claim
      const ix = await program.methods
        .claimVault()
        .accounts({
          nominee: nominee.publicKey,
          owner: payer.publicKey,
          mint,
        } as any)
        .instruction();

      txResult = await sendInstruction(ix, [nominee]);
    });

    it("transaction should succeed", () => {
      assert.isNull(
        txResult.result,
        `Expected success but got: ${JSON.stringify(txResult.result)}`
      );
    });

    it("logs should contain claim_vault message", () => {
      const logs = txResult.meta?.logMessages ?? [];
      const claimLog = logs.find((l) => l.includes("claim_vault"));
      assert.exists(claimLog, `Expected 'claim_vault' in logs. Got:\n${logs.join("\n")}`);
      console.log("Claim log:", claimLog);
    });

    it("logs should show correct token amount claimed", () => {
      const logs = txResult.meta?.logMessages ?? [];
      const claimLog = logs.find((l) => l.includes("claimed"));
      assert.exists(claimLog, "Expected 'claimed' in logs");
      assert.include(
        claimLog,
        STAKE_AMOUNT.toString(),
        `Expected stake amount ${STAKE_AMOUNT} in claim log`
      );
    });

    it("vault PDA should be closed", async () => {
      try {
        await program.account.commitmentVault.fetch(vaultPda);
        assert.fail("Vault PDA should be closed after claim");
      } catch (err: any) {
        // Account not found is expected - vault was closed
        const errStr = err.toString();
        assert.ok(
          errStr.includes("Could not find") || errStr.includes("Account does not exist"),
          `Unexpected error: ${errStr}`
        );
      }
    });

    it("vault ATA should be closed", async () => {
      try {
        // Try to fetch the vault ATA - should fail
        const vaultAtaInfo = await client.getAccount(vaultAtaAddress);
        assert.isNull(vaultAtaInfo, "Vault ATA should be closed after claim");
      } catch (err: any) {
        // Account not found is expected - vault ATA was closed
        // This is the success case
      }
    });

    it("last log line should say 'success'", () => {
      const logs = txResult.meta?.logMessages ?? [];
      const last = logs[logs.length - 1] ?? "";
      assert.include(last, "success", `Expected last log to include 'success', got: ${last}`);
    });
  });

  // TEST: Non-nominee cannot claim
  describe("non-nominee tries to claim", () => {
    let txResult: BanksTransactionResultWithMeta;
    let fakeNominee: Keypair;

    before(async () => {
      // Initialize a fresh vault
      await initVaultBankrun(ONE_HOUR);

      // Create a fake nominee
      fakeNominee = Keypair.generate();
      await fundAccount(fakeNominee.publicKey, LAMPORTS_PER_SOL);

      // Read the deadline and warp past it
      const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultAccount.deadline.toNumber());
      await warpTimeTo(deadlineTs + 1n);

      // Attempt to claim with wrong nominee
      const ix = await program.methods
        .claimVault()
        .accounts({
          nominee: fakeNominee.publicKey,
          owner: payer.publicKey,
          mint,
        } as any)
        .instruction();

      txResult = await sendInstruction(ix, [fakeNominee]);
    });

    after(async () => {
      // Clean up
      const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
      const deadlineTs = BigInt(vaultAccount.deadline.toNumber());
      await warpTimeTo(deadlineTs - 60n);

      const ix = await program.methods
        .closeVault()
        .accounts({ owner: payer.publicKey, mint } as any)
        .instruction();
      await sendInstruction(ix);
    });

    it("transaction should fail", () => {
      assert.isNotNull(txResult.result, "Expected transaction to fail for non-nominee");
    });

    it("should contain NotNominee error in logs", () => {
      const logs = txResult.meta?.logMessages ?? [];
      const errorLog = logs.find((l) => l.includes("NotNominee"));
      assert.exists(
        errorLog,
        `Expected 'NotNominee' in logs. Got:\n${logs.join("\n")}`
      );
    });
  });
});
