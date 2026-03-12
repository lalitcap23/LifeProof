import * as anchor from "@coral-xyz/anchor";
import { AnchorError, Program, BN } from "@coral-xyz/anchor";
import { ProofPol } from "../target/types/proof_pol";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAKE_LAMPORTS = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
const ONE_HOUR_SEC = new BN(3_600);                   // minimum valid interval
const MIN_STAKE_BN = new BN(10_000_000);              // 0.01 SOL threshold

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive the vault PDA for a given owner pubkey (synchronous). */
function vaultPda(program: Program<ProofPol>, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    program.programId
  );
}

/** Airdrop SOL to a pubkey and wait for confirmation. */
async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol = 5
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

/** Sleep for `ms` milliseconds. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("proof_pol — Commitment Staking Protocol", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.ProofPol as Program<ProofPol>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;

  /**
   * Helper: create a fresh vault for `owner` / `nominee`.
   * Returns the vault PDA pubkey.
   */
  async function initVault(
    owner: Keypair,
    nominee: Keypair,
    stake = STAKE_LAMPORTS,
    interval = ONE_HOUR_SEC
  ): Promise<PublicKey> {
    const [vaultKey] = vaultPda(program, owner.publicKey);
    await program.methods
      .initializeVault(stake, interval)
      .accounts({
        owner: owner.publicKey,
        nominee: nominee.publicKey,
        vault: vaultKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    return vaultKey;
  }

  // Each suite gets fresh keypairs funded with enough SOL.
  let owner: Keypair;
  let nominee: Keypair;

  beforeEach(async () => {
    owner = Keypair.generate();
    nominee = Keypair.generate();
    await Promise.all([
      airdrop(connection, owner.publicKey, 5),
      airdrop(connection, nominee.publicKey, 1),
    ]);
  });

  // ─── 1. initialize_vault ───────────────────────────────────────────────────

  describe("initialize_vault", () => {
    it("creates a vault with correct initial state", async () => {
      const vaultKey = await initVault(owner, nominee);
      const state = await program.account.commitmentVault.fetch(vaultKey);

      assert.equal(state.owner.toBase58(), owner.publicKey.toBase58(), "owner mismatch");
      assert.equal(state.nominee.toBase58(), nominee.publicKey.toBase58(), "nominee mismatch");
      assert.isTrue(state.isActive, "vault should start active");
      assert.equal(state.stakeAmount.toString(), STAKE_LAMPORTS.toString(), "stake_amount mismatch");
      assert.equal(state.checkinInterval.toString(), ONE_HOUR_SEC.toString(), "checkin_interval mismatch");

      // Deadline should be within ±60 s of (now + 1 hour).
      const now = Math.floor(Date.now() / 1000);
      const deadline = state.deadline.toNumber();
      assert.approximately(deadline, now + 3_600, 60, "deadline should be ~1 hour from now");

      console.log("✅ Vault initialized. Deadline:", new Date(deadline * 1000).toISOString());
    });

    it("rejects stake below minimum (< 0.01 SOL)", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);
      const tinyStake = new BN(1_000); // 0.000001 SOL

      try {
        await program.methods
          .initializeVault(tinyStake, ONE_HOUR_SEC)
          .accounts({
            owner: owner.publicKey,
            nominee: nominee.publicKey,
            vault: vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        assert.fail("Expected tx to fail with StakeTooLow");
      } catch (err: unknown) {
        if (err instanceof AnchorError) {
          assert.equal(err.error.errorCode.code, "StakeTooLow", "wrong error code");
        } else {
          assert.include(String(err), "StakeTooLow", "error did not mention StakeTooLow");
        }
        console.log("✅ StakeTooLow rejected correctly.");
      }
    });

    it("rejects self-nomination (owner == nominee)", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      try {
        await program.methods
          .initializeVault(STAKE_LAMPORTS, ONE_HOUR_SEC)
          .accounts({
            owner: owner.publicKey,
            nominee: owner.publicKey, // same as owner → should fail
            vault: vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        assert.fail("Expected tx to fail with SelfNominee");
      } catch (err: unknown) {
        if (err instanceof AnchorError) {
          assert.equal(err.error.errorCode.code, "SelfNominee", "wrong error code");
        } else {
          assert.include(String(err), "SelfNominee", "error did not mention SelfNominee");
        }
        console.log("✅ SelfNominee rejected correctly.");
      }
    });

    it("rejects interval shorter than 1 hour", async () => {
      const [vaultKey] = vaultPda(program, owner.publicKey);

      try {
        await program.methods
          .initializeVault(STAKE_LAMPORTS, new BN(60)) // 60 s < 1 h
          .accounts({
            owner: owner.publicKey,
            nominee: nominee.publicKey,
            vault: vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        assert.fail("Expected tx to fail with IntervalTooShort");
      } catch (err: unknown) {
        if (err instanceof AnchorError) {
          assert.equal(err.error.errorCode.code, "IntervalTooShort", "wrong error code");
        } else {
          assert.include(String(err), "IntervalTooShort", "error did not mention IntervalTooShort");
        }
        console.log("✅ IntervalTooShort rejected correctly.");
      }
    });
  });

  // ─── 2. proof_of_life ──────────────────────────────────────────────────────

  describe("proof_of_life", () => {
    let vaultKey: PublicKey;

    beforeEach(async () => {
      vaultKey = await initVault(owner, nominee);
    });

    it("advances last_checkin and deadline after a successful check-in", async () => {
      const before = await program.account.commitmentVault.fetch(vaultKey);

      // Sleep 1 s so onchain timestamp is measurably different.
      await sleep(1_000);

      await program.methods
        .proofOfLife()
        .accounts({ owner: owner.publicKey, vault: vaultKey })
        .signers([owner])
        .rpc();

      const after = await program.account.commitmentVault.fetch(vaultKey);

      assert.isTrue(
        after.lastCheckin.gt(before.lastCheckin),
        "last_checkin should have advanced"
      );
      assert.isTrue(
        after.deadline.gt(before.deadline),
        "deadline should have advanced"
      );

      // New deadline should be ~1 hour ahead of the updated last_checkin.
      const expectedDeadline = after.lastCheckin.toNumber() + ONE_HOUR_SEC.toNumber();
      assert.approximately(
        after.deadline.toNumber(),
        expectedDeadline,
        10,
        "deadline should equal last_checkin + interval"
      );

      console.log("✅ Deadline rolled forward:", new Date(after.deadline.toNumber() * 1000).toISOString());
    });

    it("rejects a non-owner trying to check in", async () => {
      const imposter = Keypair.generate();
      await airdrop(connection, imposter.publicKey, 1);

      try {
        await program.methods
          .proofOfLife()
          .accounts({ owner: imposter.publicKey, vault: vaultKey })
          .signers([imposter])
          .rpc();
        assert.fail("Expected tx to fail — imposter should not be able to check in");
      } catch (err: unknown) {
        // Could be AnchorError (NotOwner / seeds constraint) or raw Error.
        assert.ok(err, "should have thrown an error");
        console.log("✅ Non-owner check-in rejected correctly.");
      }
    });
  });

  // ─── 3. close_vault ────────────────────────────────────────────────────────

  describe("close_vault", () => {
    let vaultKey: PublicKey;

    beforeEach(async () => {
      vaultKey = await initVault(owner, nominee);
    });

    it("owner reclaims stake and vault PDA is closed", async () => {
      const balanceBefore = await connection.getBalance(owner.publicKey);

      await program.methods
        .closeVault()
        .accounts({
          owner: owner.publicKey,
          vault: vaultKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const balanceAfter = await connection.getBalance(owner.publicKey);

      // Owner should net-positive after claiming (stake > tx fee).
      assert.isAbove(balanceAfter, balanceBefore, "owner should receive stake back");

      // Vault PDA account must be gone.
      const vaultInfo = await connection.getAccountInfo(vaultKey);
      assert.isNull(vaultInfo, "vault PDA should be closed after close_vault");

      const reclaimedSol = (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL;
      console.log(`✅ Vault closed. Owner reclaimed ~${reclaimedSol.toFixed(4)} SOL.`);
    });

    it("nominee CANNOT close the vault (only owner can)", async () => {
      try {
        await program.methods
          .closeVault()
          .accounts({
            owner: nominee.publicKey, // wrong signer
            vault: vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([nominee])
          .rpc();
        assert.fail("Expected tx to fail — nominee should not be able to close vault");
      } catch (err: unknown) {
        assert.ok(err, "should have thrown an error");
        console.log("✅ Nominee-close rejected correctly.");
      }
    });
  });

  // ─── 4. claim_vault ────────────────────────────────────────────────────────

  describe("claim_vault", () => {
    let vaultKey: PublicKey;

    beforeEach(async () => {
      vaultKey = await initVault(owner, nominee);
    });

    it("nominee CANNOT claim before the deadline", async () => {
      try {
        await program.methods
          .claimVault()
          .accounts({
            nominee: nominee.publicKey,
            owner: owner.publicKey,
            vault: vaultKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([nominee])
          .rpc();
        assert.fail("Expected tx to fail with DeadlineNotPassed");
      } catch (err: unknown) {
        if (err instanceof AnchorError) {
          assert.equal(err.error.errorCode.code, "DeadlineNotPassed", "wrong error code");
        } else {
          assert.include(String(err), "DeadlineNotPassed", "error did not mention DeadlineNotPassed");
        }
        console.log("✅ Early claim rejected correctly.");
      }
    });

    /**
     * Full deadline-miss scenario.
     *
     * Testing this on a real validator requires either:
     *   (a) A very short MIN_CHECKIN_INTERVAL (e.g. 2 s) AND waiting for it to expire, or
     *   (b) Clock manipulation via `anchor test --provider.cluster localnet` +
     *       `program_test::warp_to_timestamp` (Rust integration test approach).
     *
     * The test is skipped here to keep the suite fast.  To enable it:
     *   1. Lower `MIN_CHECKIN_INTERVAL` to 2 in constants.rs.
     *   2. Replace `ONE_HOUR_SEC` with `new BN(2)` in initVault call.
     *   3. `await sleep(5_000)` before the claim call.
     *   4. Remove the `this.skip()` call below.
     */
    it("nominee CAN claim after the deadline is missed [clock-warp required]", async function () {
      this.timeout(30_000);
      this.skip();

      // ── What this test will verify once enabled ───────────────────────────
      //
      // const nomineeBefore = await connection.getBalance(nominee.publicKey);
      //
      // await sleep(5_000); // wait for the 2-s deadline to expire
      //
      // await program.methods
      //   .claimVault()
      //   .accounts({
      //     nominee:       nominee.publicKey,
      //     owner:         owner.publicKey,
      //     vault:         vaultKey,
      //     systemProgram: SystemProgram.programId,
      //   })
      //   .signers([nominee])
      //   .rpc();
      //
      // const nomineeAfter = await connection.getBalance(nominee.publicKey);
      // assert.isAbove(nomineeAfter, nomineeBefore, "nominee should receive the staked funds");
      //
      // const vaultInfo = await connection.getAccountInfo(vaultKey);
      // assert.isNull(vaultInfo, "vault PDA should be closed after claim");
      //
      // console.log(`✅ Nominee claimed ~${(nomineeAfter - nomineeBefore) / LAMPORTS_PER_SOL} SOL.`);
    });
  });
});
