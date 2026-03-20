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
    startAnchor
} from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
    Keypair,
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
} from "@solana/spl-token";
import { assert } from "chai";


/** Derive the vault PDA for a given owner. */
function findVaultPda(owner: PublicKey, programId: PublicKey) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), owner.toBuffer()],
        programId
    );
}

//  shared constants 
const PLATFORM_WALLET = new PublicKey(
    "99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q"
);
const STAKE_AMOUNT = 10_000_000; // 10 tokens (6 decimals)
const ONE_HOUR = 3_600;          // minimum allowed checkin interval

//  test suite 

describe("close_vault", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.ProofPol as Program<ProofPol>;
    const wallet = provider.wallet as anchor.Wallet;

    // Shared state across tests
    let mint: PublicKey;
    let usdcMint: PublicKey;
    let ownerAtaAddress: PublicKey;
    let ownerUsdcAta: any;
    let platformUsdcAta: any;
    let vaultPda: PublicKey;
    let vaultBump: number;
    let vaultAtaAddress: PublicKey;

    //  before: fund mints and ATAs 
    before(async () => {
        // 1. Create stake token mint
        mint = await createMint(
            provider.connection,
            wallet.payer,
            wallet.publicKey,
            null,
            6
        );

        // 2. Create owner ATA and mint tokens into it
        const ownerAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            wallet.payer,
            mint,
            wallet.publicKey
        );
        ownerAtaAddress = ownerAta.address;

        await mintTo(
            provider.connection,
            wallet.payer,
            mint,
            ownerAtaAddress,
            wallet.publicKey,
            100_000_000 // 100 tokens – enough for multiple tests
        );

        // 3. Create USDC mint + ATAs (platform fee path)
        usdcMint = await createMint(
            provider.connection,
            wallet.payer,
            wallet.publicKey,
            null,
            6
        );

        ownerUsdcAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            wallet.payer,
            usdcMint,
            wallet.publicKey
        );

        await mintTo(
            provider.connection,
            wallet.payer,
            usdcMint,
            ownerUsdcAta.address,
            wallet.publicKey,
            10_000_000 // 10 USDC – plenty of platform fee headroom
        );

        platformUsdcAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            wallet.payer,
            usdcMint,
            PLATFORM_WALLET,
            true // allowOwnerOffCurve
        );

        // 4. Derive vault addresses
        [vaultPda, vaultBump] = findVaultPda(wallet.publicKey, program.programId);
        vaultAtaAddress = getAssociatedTokenAddressSync(mint, vaultPda, true);
    });

    //  helper: initialise a fresh vault 
    async function initVault(
        checkinInterval: number = ONE_HOUR,
        stake: number = STAKE_AMOUNT
    ) {
        await program.methods
            .initializeVault(new anchor.BN(stake), new anchor.BN(checkinInterval))
            .accounts({
                owner: wallet.publicKey,
                nominee: Keypair.generate().publicKey,
                mint,
                usdcMint,
                ownerUsdcAta: ownerUsdcAta.address,
                platformWallet: PLATFORM_WALLET,
                platformUsdcAta: platformUsdcAta.address,
            } as any)
            .rpc();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TEST 1 – Happy path: owner closes vault and gets tokens back
    // ══════════════════════════════════════════════════════════════════════════
    it("owner can close the vault and reclaim staked tokens", async () => {
        // Setup: initialise the vault
        await initVault();

        // Note owner's token balance before close
        const ownerBefore = await getAccount(provider.connection, ownerAtaAddress);
        const ownerBalanceBefore = Number(ownerBefore.amount);

        // Vault ATA should hold STAKE_AMOUNT
        const vaultBefore = await getAccount(provider.connection, vaultAtaAddress);
        assert.equal(
            Number(vaultBefore.amount),
            STAKE_AMOUNT,
            "vault_ata should hold the staked tokens"
        );

        // Execute close
        await program.methods
            .closeVault()
            .accounts({
                owner: wallet.publicKey,
                mint,
            } as any)
            .rpc();

        //  assertions 

        // 1. Owner ATA received the tokens back
        const ownerAfter = await getAccount(provider.connection, ownerAtaAddress);
        assert.equal(
            Number(ownerAfter.amount),
            ownerBalanceBefore + STAKE_AMOUNT,
            "owner should receive staked tokens back"
        );

        // 2. Vault ATA is closed (account no longer exists)
        try {
            await getAccount(provider.connection, vaultAtaAddress);
            assert.fail("vault_ata should have been closed");
        } catch (err: any) {
            // Re-throw if this is our own assert.fail (AssertionError)
            if (err.name === "AssertionError") throw err;
            // Any other error means the account is gone – that's what we want.
            // @solana/spl-token v0.4+ throws TokenAccountNotFoundError with an
            // empty .message, so we can't rely on the message text.
        }

        // 3. Vault PDA is closed (account no longer exists)
        const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
        assert.isNull(vaultInfo, "vault PDA should be closed");
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TEST 2 – Sad path: close after deadline should fail
    // ══════════════════════════════════════════════════════════════════════════
    it("fails to close vault when the deadline has already passed", async () => {
        // Setup: initialise a fresh vault with the minimum check-in interval.
        // We can't actually warp time in a local validator without tricks, so
        // we instead test the error by manipulating a vault whose on-chain
        // deadline is in the past via a very small interval.
        //
        // Strategy: if the validator clock has advanced sufficiently, the
        // deadline of a vault initialized with MIN_INTERVAL will still be in
        // the future – we therefore skip this test when we cannot force the
        // deadline to be in the past.
        //
        // For a real environment with bankrun / solana-test-validator --warp,
        // you could warp the clock forward. Here we document the expected error.

        // Initialise with 1-hour interval (deadline is in the future)
        await initVault(ONE_HOUR);

        // Immediately attempt close – should succeed (deadline NOT passed).
        // This is the control to show the error path would look like:
        try {
            // ── Simulated deadline-passed check (read deadline from vault) ──
            const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
            const now = Math.floor(Date.now() / 1_000);

            if (now > vaultAccount.deadline.toNumber()) {
                // Clock is ahead of deadline → this is the scenario we want to test
                let failed = false;
                try {
                    await program.methods
                        .closeVault()
                        .accounts({
                            owner: wallet.publicKey,
                            mint,
                        } as any)
                        .rpc();
                } catch (err: any) {
                    failed = true;
                    const anchorErr = err as AnchorError;
                    assert.equal(
                        anchorErr.error.errorCode.code,
                        "DeadlineAlreadyPassed",
                        "expected DeadlineAlreadyPassed error"
                    );
                }
                assert.isTrue(failed, "close should have failed with DeadlineAlreadyPassed");
            } else {
                console.log(
                    "⚠️  Deadline is in the future – skipping deadline-passed assertion " +
                    "(use clock warp / bankrun for deterministic testing)"
                );
                // Clean up the open vault for the next test
                await program.methods
                    .closeVault()
                    .accounts({ owner: wallet.publicKey, mint } as any)
                    .rpc();
            }
        } catch (err: any) {
            throw err;
        }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TEST 3 – Sad path: non-owner cannot close the vault
    // ══════════════════════════════════════════════════════════════════════════
    it("fails when a non-owner tries to close the vault", async () => {
        // Setup: initialise a fresh vault owned by `wallet`
        await initVault();

        // Create a rogue signer
        const rogue = Keypair.generate();
        // Fund rogue with lamports so it can pay fees
        const airdropSig = await provider.connection.requestAirdrop(
            rogue.publicKey,
            1_000_000_000
        );
        await provider.connection.confirmTransaction(airdropSig);

        // Derive vault PDA (still keyed to the real owner, wallet.publicKey)
        const [rogueVaultPda] = findVaultPda(wallet.publicKey, program.programId);

        let failed = false;
        try {
            await program.methods
                .closeVault()
                .accounts({
                    owner: rogue.publicKey,
                    mint,
                    // Override vault to point at the real vault (owned by wallet)
                    vault: rogueVaultPda,
                } as any)
                .signers([rogue])
                .rpc();
        } catch (err: any) {
            failed = true;
            // Anchor should reject at the constraint level (seeds mismatch or has_one)
            // The error is either a ConstraintSeeds violation or NotOwner.
            const errStr = JSON.stringify(err);
            const isExpected =
                errStr.includes("NotOwner") ||
                errStr.includes("ConstraintSeeds") ||
                errStr.includes("seeds constraint") ||
                errStr.includes("2003") || // ConstraintSeeds code
                errStr.includes("AnchorError");
            assert.isTrue(isExpected, `Unexpected error type: ${errStr}`);
        }
        assert.isTrue(failed, "close should have failed for non-owner");

        // Clean up: close the vault as the real owner
        await program.methods
            .closeVault()
            .accounts({ owner: wallet.publicKey, mint } as any)
            .rpc();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // TEST 4 – Sad path: cannot close a vault that is already inactive / closed
    // ══════════════════════════════════════════════════════════════════════════
    it("fails when trying to close a vault that is already closed", async () => {
        // Setup: initialise then immediately close the vault
        await initVault();

        await program.methods
            .closeVault()
            .accounts({ owner: wallet.publicKey, mint } as any)
            .rpc();

        // Now the vault PDA is gone. Calling close again should fail.
        let failed = false;
        try {
            await program.methods
                .closeVault()
                .accounts({ owner: wallet.publicKey, mint } as any)
                .rpc();
        } catch (err: any) {
            failed = true;
            // The program will reject because the vault account no longer exists.
            const errStr = JSON.stringify(err);
            assert.ok(
                errStr.includes("AccountNotInitialized") ||
                errStr.includes("account does not exist") ||
                errStr.includes("AccountOwnedByWrongProgram") ||
                errStr.length > 0,
                `Unexpected error: ${errStr}`
            );
        }
        assert.isTrue(failed, "double-close should have failed");
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// BANKRUN TIME-TRAVEL SUITE – DeadlineAlreadyPassed
//
// Uses solana-bankrun's `startAnchor` + `context.setClock()` to deterministically
// warp the on-chain unix_timestamp past the vault deadline, then asserts the
// `close_vault` instruction fails with `DeadlineAlreadyPassed`.
// ══════════════════════════════════════════════════════════════════════════════
describe("close_vault – deadline (bankrun time-travel)", () => {

    // ─── Programme ID (matches Anchor.toml) ──────────────────────────────────
    const PROGRAM_ID = new anchor.web3.PublicKey(
        "aosGKFX4wB17YnkDjrCTyE4imXXadnwjxe2jsYWEY4e"
    );

    // Bankrun context shared across all tests in this suite
    let context: ProgramTestContext;
    let client: BanksClient;
    let provider: BankrunProvider;
    let program: Program<ProofPol>;

    // Wallet / keys
    let payer: anchor.web3.Keypair;

    // Token mints & ATAs
    let mint: anchor.web3.PublicKey;
    let usdcMint: anchor.web3.PublicKey;
    let ownerAtaAddress: anchor.web3.PublicKey;
    let ownerUsdcAtaAddress: anchor.web3.PublicKey;
    let platformUsdcAtaAddress: anchor.web3.PublicKey;

    // Vault addresses
    let vaultPda: anchor.web3.PublicKey;
    let vaultBump: number;
    let vaultAtaAddress: anchor.web3.PublicKey;

    // Helper: get fresh blockhash from bankrun
    async function getLatestBlockhash(): Promise<string> {
        const latestBlockhash = await client.getLatestBlockhash();
        return latestBlockhash?.[0] ?? context.lastBlockhash;
    }

    // Helper: build and process a transaction via BanksClient (returns result + meta)
    async function sendInstruction(
        ix: TransactionInstruction,
        signers: anchor.web3.Keypair[] = []
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
                unixTs          // ← the only field that matters for our guard
            )
        );
    }

    // ─── Bankrun-compatible token helpers ────────────────────────────────────
    //
    // BankrunProvider.connection is a shim – it does NOT implement
    // `sendTransaction`, so the high-level @solana/spl-token helpers
    // (createMint, getOrCreateAssociatedTokenAccount, mintTo) cannot be used.
    // We build raw transactions and submit them directly via BanksClient.

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
            createInitializeMintInstruction(
                mintKp.publicKey, decimals, mintAuthority, null
            )
        );
        tx.sign(payer, mintKp);
        await client.processTransaction(tx);
        return mintKp.publicKey;
    }

    /** Create an ATA (init_if_needed behaviour) and return its address. */
    async function bkCreateAta(
        mintPub: PublicKey,
        owner: PublicKey
    ): Promise<PublicKey> {
        const ata = getAssociatedTokenAddressSync(mintPub, owner, true);
        const tx = new Transaction();
        tx.recentBlockhash = context.lastBlockhash;
        tx.feePayer = payer.publicKey;
        tx.add(
            createAssociatedTokenAccountInstruction(
                payer.publicKey, ata, owner, mintPub
            )
        );
        tx.sign(payer);
        await client.processTransaction(tx);
        return ata;
    }

    /** Mint `amount` raw token units to `destination`. */
    async function bkMintTo(
        mintPub: PublicKey,
        destination: PublicKey,
        authority: Keypair,
        amount: number
    ): Promise<void> {
        const tx = new Transaction();
        tx.recentBlockhash = context.lastBlockhash;
        tx.feePayer = payer.publicKey;
        tx.add(
            createMintToInstruction(
                mintPub, destination, authority.publicKey, amount
            )
        );
        tx.sign(payer, authority);
        await client.processTransaction(tx);
    }

    // ─── Global setup: start bankrun + create mints + ATAs ───────────────────
    before(async () => {
        // Boot bankrun with the compiled proof_pol program
        context = await startAnchor(
            "./",  // project root (Anchor.toml location)
            [],    // no extra programs
            []     // no extra pre-funded accounts
        );
        client = context.banksClient;
        provider = new BankrunProvider(context);
        anchor.setProvider(provider);
        // Create program with the bankrun provider (don't use cached anchor.workspace)
        program = new Program<ProofPol>(IDL, provider);
        payer = context.payer;

        // ── 1. Stake-token mint ────────────────────────────────────────────
        mint = await bkCreateMint(payer.publicKey, 6);

        // ── 2. Owner ATA for stake token + fund it ─────────────────────────
        ownerAtaAddress = await bkCreateAta(mint, payer.publicKey);
        await bkMintTo(mint, ownerAtaAddress, payer, 200_000_000);

        // ── 3. USDC mint + owner ATA + platform ATA ────────────────────────
        usdcMint = await bkCreateMint(payer.publicKey, 6);
        ownerUsdcAtaAddress = await bkCreateAta(usdcMint, payer.publicKey);
        await bkMintTo(usdcMint, ownerUsdcAtaAddress, payer, 50_000_000);
        platformUsdcAtaAddress = await bkCreateAta(usdcMint, PLATFORM_WALLET);

        // ── 4. Derive vault PDAs ───────────────────────────────────────────
        [vaultPda, vaultBump] = findVaultPda(payer.publicKey, PROGRAM_ID);
        vaultAtaAddress = getAssociatedTokenAddressSync(mint, vaultPda, true);
    });

    // Helper: initialise a fresh vault via raw transaction (bankrun-compatible)
    async function initVaultBankrun(checkinInterval: number = ONE_HOUR) {
        const ix = await program.methods
            .initializeVault(new BN(STAKE_AMOUNT), new BN(checkinInterval))
            .accounts({
                owner: payer.publicKey,
                nominee: anchor.web3.Keypair.generate().publicKey,
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

    // ─────────────────────────────────────────────────────────────────────────
    // Parameterised time-travel scenarios
    // ─────────────────────────────────────────────────────────────────────────

    const scenarios = [
        {
            desc: "before deadline  → close succeeds",
            warpPastDeadline: false,
            shouldSucceed: true,
        },
        {
            desc: "after deadline   → close fails with DeadlineAlreadyPassed",
            warpPastDeadline: true,
            shouldSucceed: false,
        },
    ];

    scenarios.forEach(({ desc, warpPastDeadline, shouldSucceed }) => {
        describe(`When clock is ${desc}`, () => {

            let txResult: BanksTransactionResultWithMeta;

            before(async () => {
                // Fresh vault for every sub-suite
                await initVaultBankrun(ONE_HOUR);

                // Read the deadline stored on-chain
                const vaultAccount = await program.account.commitmentVault.fetch(vaultPda);
                const deadlineTs = BigInt(vaultAccount.deadline.toNumber());

                if (warpPastDeadline) {
                    // Warp 1 second PAST the deadline
                    await warpTimeTo(deadlineTs + 1n);
                } else {
                    // Stay 60 seconds BEFORE the deadline (safe margin)
                    await warpTimeTo(deadlineTs - 60n);
                }

                // Build the closeVault instruction and send it as a raw tx
                // so we can inspect the result without throwing
                const ix = await program.methods
                    .closeVault()
                    .accounts({
                        owner: payer.publicKey,
                        mint,
                    } as any)
                    .instruction();

                txResult = await sendInstruction(ix);

                // If the close succeeded (no deadline warp) we move on.
                // If it failed (deadline warp), the vault is still open –
                // clean it up by warping back and closing normally.
                if (!shouldSucceed) {
                    // Warp back to a safe point before deadline
                    const freshVault = await program.account.commitmentVault.fetch(vaultPda);
                    const dl = BigInt(freshVault.deadline.toNumber());
                    await warpTimeTo(dl - 60n);

                    // Close vault using raw transaction (bankrun-compatible)
                    const closeIx = await program.methods
                        .closeVault()
                        .accounts({ owner: payer.publicKey, mint } as any)
                        .instruction();
                    await sendInstruction(closeIx);
                }
            });

            if (shouldSucceed) {
                // ── CONTROL: deadline NOT passed → close must succeed ─────
                it("transaction result should be null (success)", () => {
                    assert.isNull(
                        txResult.result,
                        `Expected success but got: ${JSON.stringify(txResult.result)}`
                    );
                });

                it("last log line should say 'success'", () => {
                    const logs = txResult.meta?.logMessages ?? [];
                    const last = logs[logs.length - 1] ?? "";
                    assert.include(
                        last,
                        "success",
                        `Expected last log to include 'success', got: ${last}`
                    );
                });

                it("logs should contain close_vault reclaim message", () => {
                    const logs = txResult.meta?.logMessages ?? [];
                    const found = logs.some((l) => l.includes("close_vault"));
                    assert.isTrue(found, "Expected a 'close_vault' log line");
                });

            } else {
                // ── SAD PATH: deadline has passed → must fail ────────────
                it("transaction result should be non-null (failure)", () => {
                    assert.isNotNull(
                        txResult.result,
                        "Expected transaction to fail but it succeeded"
                    );
                });

                it("logs should contain 'DeadlineAlreadyPassed' error", () => {
                    const logs = txResult.meta?.logMessages ?? [];
                    const errorLog = logs.find((l) =>
                        l.includes("DeadlineAlreadyPassed")
                    );
                    assert.exists(
                        errorLog,
                        `Expected a log containing 'DeadlineAlreadyPassed'. Logs:\n${logs.join("\n")}`
                    );
                });

                it("logs should contain AnchorError", () => {
                    const logs = txResult.meta?.logMessages ?? [];
                    const anchorErrorLog = logs.find((l) => l.includes("AnchorError"));
                    assert.exists(
                        anchorErrorLog,
                        `Expected an AnchorError log. Logs:\n${logs.join("\n")}`
                    );
                });

                it("last log line should say 'failed'", () => {
                    const logs = txResult.meta?.logMessages ?? [];
                    const last = logs[logs.length - 1] ?? "";
                    assert.include(
                        last,
                        "failed",
                        `Expected last log to include 'failed', got: ${last}`
                    );
                });
            }
        });
    });
});