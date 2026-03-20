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
} from "@solana/spl-token";
import { assert } from "chai";

describe("initialize vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);


  const program = anchor.workspace.ProofPol as Program<ProofPol>;

  const wallet = provider.wallet as anchor.Wallet;
  let mint: anchor.web3.PublicKey;
  let ownerAta: any;
  let vaultAtaAddress: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;

  // Clean up: close the vault after tests so other test suites can create their own
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
      // Vault might not exist if test failed, ignore
    }
  });

  it("Initialize vault works", async () => {
    // 1. Create mint
    mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // 2. Create owner ATA
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

    // Create Platform Wallet
    const platformWallet = new anchor.web3.PublicKey("99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q");

    // Create USDC mint
    let usdcMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // Create Owner USDC ATA
    let ownerUsdcAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      usdcMint,
      wallet.publicKey
    );

    // Mint USDC to owner (e.g. 5 USDC)
    await mintTo(
      provider.connection,
      wallet.payer,
      usdcMint,
      ownerUsdcAta.address,
      wallet.publicKey,
      5_000_000
    );

    // Create Platform USDC ATA
    let platformUsdcAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      usdcMint,
      platformWallet,
      true // allowOwnerOffCurve just in case
    );

    // 4. Derive vault PDA
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"),
     wallet.publicKey.toBuffer()],
     program.programId
    );

    // 5. Derive vault ATA address
    vaultAtaAddress = getAssociatedTokenAddressSync(mint, vaultPda, true);

    // 6. Call instruction
    await program.methods
      .initializeVault(new anchor.BN(10_000_000), new anchor.BN(0))
      .accounts({
        owner: wallet.publicKey,
        nominee: anchor.web3.Keypair.generate().publicKey,
        mint,
        usdcMint,
        ownerUsdcAta: ownerUsdcAta.address,
        platformWallet,
        platformUsdcAta: platformUsdcAta.address,
      } as any)
      .rpc();

    // 7. Check vault account
    const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);

    console.log("Vault:", vaultAccount);

    // 8. Check token balance moved
    const vaultToken = await getAccount(
      provider.connection,
      vaultAtaAddress
    );

    console.log("Vault token balance:", Number(vaultToken.amount));

    if (Number(vaultToken.amount) !== 10_000_000) {
      throw new Error("Transfer failed");
    }

    // 9. Check platform fee moved
    const platformToken = await getAccount(
      provider.connection,
      platformUsdcAta.address
    );

    console.log("Platform token balance:", Number(platformToken.amount));

    if (Number(platformToken.amount) !== 1_000_000) {
      throw new Error("Platform fee transfer failed");
    }
  });
});