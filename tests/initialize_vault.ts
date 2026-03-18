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
} from "@solana/spl-token";
import { assert } from "chai";
describe("initialize vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CommitmentVault as Program<CommitmentVault>;

  const owner = provider.wallet;
  let mint: anchor.web3.PublicKey;
  let ownerAta: any;
  let vaultAta: any;
  let vaultPda: anchor.web3.PublicKey;

  it("Initialize vault works", async () => {
    // 1. Create mint
    mint = await createMint(
      provider.connection,
      owner.payer,
      owner.publicKey,
      null,
      6
    );

    // 2. Create owner ATA
    ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner.payer,
      mint,
      owner.publicKey
    );

    // 3. Mint tokens to owner
    await mintTo(
      provider.connection,
      owner.payer,
      mint,
      ownerAta.address,
      owner.publicKey,
      1000
    );

    // 4. Derive vault PDA
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()],
      program.programId
    );

    // 5. Derive vault ATA
    vaultAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner.payer,
      mint,
      vaultPda,
      true
    );

    // 6. Call instruction
    await program.methods
      .initializeVault(new anchor.BN(500), new anchor.BN(0))
      .accounts({
        owner: owner.publicKey,
        nominee: anchor.web3.Keypair.generate().publicKey,
        vault: vaultPda,
        mint,
        ownerAta: ownerAta.address,
        vaultAta: vaultAta.address,
      })
      .rpc();

    // 7. Check vault account
    const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);

    console.log("Vault:", vaultAccount);

    // 8. Check token balance moved
    const vaultToken = await getAccount(
      provider.connection,
      vaultAta.address
    );

    console.log("Vault token balance:", Number(vaultToken.amount));

    if (Number(vaultToken.amount) !== 500) {
      throw new Error("Transfer failed");
    }
  });
});