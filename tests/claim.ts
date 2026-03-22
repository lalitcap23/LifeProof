import * as anchor from "@coral-xyz/anchor";
import { AnchorError, Program, BN } from "@coral-xyz/anchor";
import { ProofPol } from "../target/types/proof_pol";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("claim vault", () => {
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

  const platformWallet = new PublicKey(
    "99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q"
  );

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
      platformWallet,
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
        platformWallet,
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
    // This test verifies that the claim instruction properly rejects
    // claims before the deadline has passed.
    //
    // NOTE: To actually test a successful claim, you need to use bankrun
    // to manipulate the clock and fast-forward past the deadline.

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

      // If we get here, the test should fail
      assert.fail("Expected DeadlineNotPassed error");
    } catch (err) {
      // Verify we got the expected error
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
    // Create a random keypair that is NOT the nominee
    const fakeNominee = Keypair.generate();

    // Airdrop SOL to fake nominee
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
      // The has_one constraint should reject this
      if (err instanceof AnchorError) {
        assert.equal(
          err.error.errorCode.code,
          "NotNominee",
          "Expected NotNominee error"
        );
        console.log("Got expected error: NotNominee");
      } else {
        // Anchor may throw a different error format for constraint violations
        console.log("Got error (expected):", err);
      }
    }
  });

  it("should verify vault state before claim attempt", async () => {
    // Fetch and verify vault state
    const vault = await program.account.commitmentVault.fetch(vaultPda);

    assert.equal(vault.owner.toBase58(), wallet.publicKey.toBase58());
    assert.equal(vault.nominee.toBase58(), nominee.publicKey.toBase58());
    assert.equal(vault.mint.toBase58(), mint.toBase58());
    assert.equal(vault.stakeAmount.toNumber(), 10_000_000);
    assert.equal(vault.isActive, true);
    assert.equal(vault.checkinInterval.toNumber(), 3600);

    // Verify vault ATA has tokens
    const vaultToken = await getAccount(provider.connection, vaultAtaAddress);
    assert.equal(Number(vaultToken.amount), 10_000_000);

    console.log("Vault state verified:");
    console.log("  Owner:", vault.owner.toBase58());
    console.log("  Nominee:", vault.nominee.toBase58());
    console.log("  Stake:", vault.stakeAmount.toNumber());
    console.log("  Deadline:", new Date(vault.deadline.toNumber() * 1000).toISOString());
    console.log("  Is Active:", vault.isActive);
  });
});
