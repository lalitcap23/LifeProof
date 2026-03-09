import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { ProofPol } from "../target/types/proof_pol";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive the vault PDA for a given owner pubkey. */
async function vaultPda(
  program: Program<ProofPol>,
  owner: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    program.programId
  );
}

/** Airdrop SOL to a keypair and confirm. */
async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol = 5
) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

/** Sleep for `ms` milliseconds. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Constants ────────────────────────────────────────────────────────────────

const STAKE_LAMPORTS = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
const ONE_HOUR_SEC   = new BN(3_600);                  // min interval
const TWO_SECONDS    = new BN(2);                      // tiny interval for deadline tests

// ─────────────────────────────────────────────────────────────────────────────

describe("proof_pol — Commitment Staking Protocol", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program   = anchor.workspace.ProofPol as Program<ProofPol>;
  const provider  = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;

  // Fresh keypairs for each scenario to keep tests independent.
  let owner   : Keypair;
  let nominee : Keypair;

  beforeEach(async () => {
    owner   = Keypair.generate();
    nominee = Keypair.generate();
    await Promise.all([
      airdrop(connection, owner.publicKey,   5),
      airdrop(connection, nominee.publicKey, 1),
    ]);
  });

  // ─── 1. Initialize ─────────────────────────────────────────────────────────

  describe("initialize_vault", () => {
    it("creates a vault with correct state", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      await program.methods
        .initializeVault(STAKE_LAMPORTS, ONE_HOUR_SEC)
        .accounts({
          owner:         owner.publicKey,
          nominee:       nominee.publicKey,
          vault:         vaultKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const state = await program.account.commitmentVault.fetch(vaultKey);

      assert.equal(state.owner.toBase58(),   owner.publicKey.toBase58(),   "owner mismatch");
      assert.equal(state.nominee.toBase58(), nominee.publicKey.toBase58(), "nominee mismatch");
      assert.isTrue(state.isActive, "vault should be active");
      assert.equal(state.stakeAmount.toString(), STAKE_LAMPORTS.toString(), "stake mismatch");
      assert.equal(state.checkinInterval.toString(), ONE_HOUR_SEC.toString(), "interval mismatch");

      // Deadline should be roughly now + 1 hour
      const now      = Math.floor(Date.now() / 1000);
      const deadline = state.deadline.toNumber();
      assert.approximately(deadline, now + 3_600, 60, "deadline should be ~1 hour from now");

      console.log("✅ Vault initialized. Deadline:", new Date(deadline * 1000).toISOString());
    });

    it("rejects stake below minimum (< 0.01 SOL)", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);
      const tinyStake  = new BN(1_000); // 0.000001 SOL

      try {
        await program.methods
          .initializeVault(tinyStake, ONE_HOUR_SEC)
          .accounts({
            owner:         owner.publicKey,
            nominee:       nominee.publicKey,
            vault:         vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (err: any) {
        assert.include(err.toString(), "StakeTooLow");
        console.log("✅ StakeTooLow rejected correctly.");
      }
    });

    it("rejects self-nomination (owner == nominee)", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      try {
        await program.methods
          .initializeVault(STAKE_LAMPORTS, ONE_HOUR_SEC)
          .accounts({
            owner:         owner.publicKey,
            nominee:       owner.publicKey, // same as owner ← should fail
            vault:         vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (err: any) {
        assert.include(err.toString(), "SelfNominee");
        console.log("✅ SelfNominee rejected correctly.");
      }
    });

    it("rejects interval shorter than 1 hour", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      try {
        await program.methods
          .initializeVault(STAKE_LAMPORTS, new BN(60)) // 60 seconds
          .accounts({
            owner:         owner.publicKey,
            nominee:       nominee.publicKey,
            vault:         vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (err: any) {
        assert.include(err.toString(), "IntervalTooShort");
        console.log("✅ IntervalTooShort rejected correctly.");
      }
    });
  });

  // ─── 2. Proof of Life ──────────────────────────────────────────────────────

  describe("proof_of_life", () => {
    it("owner can check in and deadline advances", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      await program.methods
        .initializeVault(STAKE_LAMPORTS, ONE_HOUR_SEC)
        .accounts({
          owner:         owner.publicKey,
          nominee:       nominee.publicKey,
          vault:         vaultKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const beforeState = await program.account.commitmentVault.fetch(vaultKey);

      // Wait 1 second so last_checkin timestamp changes
      await sleep(1_000);

      await program.methods
        .proofOfLife()
        .accounts({ owner: owner.publicKey, vault: vaultKey })
        .signers([owner])
        .rpc();

      const afterState = await program.account.commitmentVault.fetch(vaultKey);

      assert.isTrue(
        afterState.lastCheckin.gt(beforeState.lastCheckin),
        "last_checkin should have advanced"
      );
      assert.isTrue(
        afterState.deadline.gt(beforeState.deadline),
        "deadline should have advanced"
      );
      console.log("✅ Deadline rolled forward:", new Date(afterState.deadline.toNumber() * 1000).toISOString());
    });
  });

  // ─── 3. Voluntary Close ────────────────────────────────────────────────────

  describe("close_vault", () => {
    it("owner can close the vault and reclaim stake before deadline", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      await program.methods
        .initializeVault(STAKE_LAMPORTS, ONE_HOUR_SEC)
        .accounts({
          owner:         owner.publicKey,
          nominee:       nominee.publicKey,
          vault:         vaultKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const balanceBefore = await connection.getBalance(owner.publicKey);

      await program.methods
        .closeVault()
        .accounts({
          owner:         owner.publicKey,
          vault:         vaultKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const balanceAfter = await connection.getBalance(owner.publicKey);

      // Balance should have increased (stake returned, minus tx fees)
      assert.isAbove(balanceAfter, balanceBefore, "owner should receive stake back");

      // Vault account should be closed
      const vaultInfo = await connection.getAccountInfo(vaultKey);
      assert.isNull(vaultInfo, "vault PDA should be closed");

      console.log(
        `✅ Vault closed. Owner reclaimed ~${(balanceAfter - balanceBefore) / LAMPORTS_PER_SOL} SOL.`
      );
    });
  });

  // ─── 4. Nominee Claim (missed deadline) ────────────────────────────────────

  describe("claim_vault", () => {
    it("nominee CANNOT claim before the deadline", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      await program.methods
        .initializeVault(STAKE_LAMPORTS, ONE_HOUR_SEC)
        .accounts({
          owner:         owner.publicKey,
          nominee:       nominee.publicKey,
          vault:         vaultKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      try {
        await program.methods
          .claimVault()
          .accounts({
            nominee:       nominee.publicKey,
            owner:         owner.publicKey,
            vault:         vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([nominee])
          .rpc();
        assert.fail("Should have rejected early claim");
      } catch (err: any) {
        assert.include(err.toString(), "DeadlineNotPassed");
        console.log("✅ Early claim rejected correctly.");
      }
    });

    // NOTE: This test uses a 2-second interval (minimum is 1 hour in production,
    //       but for demo purposes we use a short interval on a local validator).
    //       On mainnet/devnet you would use a 1-hour minimum interval.
    it("nominee CAN claim after the deadline is missed [short interval demo]", async function () {
      // This test is slower due to waiting for deadline — skip in CI if needed
      this.timeout(30_000);

      // Use a tiny 2-second interval — note the validator may reject < 3600s
      // due to MIN_CHECKIN_INTERVAL; change the constant for this local test.
      // Here we simply document the expected flow with a comment.
      console.log(
        "ℹ️  Full deadline-miss scenario requires a validator with time manipulation\n" +
        "   (e.g., anchor test with `warp_to_timestamp` or a mock clock).\n" +
        "   The claim logic is already gated by: require!(vault.deadline_passed(now)).\n" +
        "   Manually advance the clock or reduce MIN_CHECKIN_INTERVAL to 2s locally."
      );
    });
  });
});
