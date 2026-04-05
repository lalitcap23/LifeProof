/**
 * Bridge between wallet-adapter (web3.js 1.x) and Codama client (@solana/kit)
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { type WalletContextState } from "@solana/wallet-adapter-react";
import { address, type Address, type TransactionSigner } from "@solana/kit";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import {
  getInitializeVaultInstructionAsync,
  getProofOfLifeInstructionAsync,
  getCloseVaultInstructionAsync,
  getClaimVaultInstructionAsync,
  fetchMaybeCommitmentVault,
  type CommitmentVault,
  PROOF_POL_PROGRAM_ADDRESS,
} from "./index";

// Re-export for convenience
export { PROOF_POL_PROGRAM_ADDRESS };
export type { CommitmentVault };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Codama instruction to web3.js 1.x TransactionInstruction.
 * Role encoding: 0=readonly, 1=writable, 2=readonly signer, 3=writable signer
 */
function codamaToWeb3Instruction(codamaInstruction: {
  programAddress: Address;
  accounts: readonly { address: Address; role: number; signer?: unknown }[];
  data: Uint8Array;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(codamaInstruction.programAddress),
    keys: codamaInstruction.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.address),
      isSigner: acc.role >= 2,        // 2=readonly signer, 3=writable signer
      isWritable: acc.role === 1 || acc.role === 3, // 1=writable, 3=writable signer
    })),
    data: Buffer.from(codamaInstruction.data),
  });
}

/**
 * Create a mock TransactionSigner from wallet public key.
 * The actual signing is done by wallet-adapter, not this signer.
 */
function createMockSigner(publicKey: PublicKey): TransactionSigner {
  return { address: publicKey.toBase58() as Address } as TransactionSigner;
}

/**
 * Create RPC-like object for Codama account fetchers.
 * Codama expects: rpc.getAccountInfo(addr).send()
 */
function createRpcFetcher(connection: Connection) {
  return {
    getAccountInfo: (addr: Address, _config?: any) => ({
      send: async () => {
        const accountInfo = await connection.getAccountInfo(new PublicKey(addr));
        if (!accountInfo) return { value: null };
        return {
          value: {
            data: new Uint8Array(accountInfo.data),
            executable: accountInfo.executable,
            lamports: BigInt(accountInfo.lamports),
            owner: accountInfo.owner.toBase58() as Address,
            rentEpoch: BigInt(accountInfo.rentEpoch || 0),
          },
        };
      },
    }),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProofPolClientConfig {
  connection: Connection;
  wallet: WalletContextState;
}

export interface InitializeVaultParams {
  nominee: string;
  mint: string;
  usdcMint: string;
  stakeAmount: bigint;
  checkinIntervalSeconds: bigint;
}

export interface ClaimVaultParams {
  ownerAddress: string;
  nomineeAddress: string;
  mintAddress: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * ProofPol Client — bridges Codama generated code with wallet-adapter.
 */
export class ProofPolClient {
  private connection: Connection;
  private wallet: WalletContextState;

  constructor(config: ProofPolClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
  }

  private get publicKey(): PublicKey {
    if (!this.wallet.publicKey) throw new Error("Wallet not connected");
    return this.wallet.publicKey;
  }

  /**
   * Send a transaction (one or more instructions) via the connected wallet.
   * Pre-simulates to surface real on-chain error messages before asking the wallet.
   */
  private async sendTransaction(
    instructions: TransactionInstruction | TransactionInstruction[]
  ): Promise<string> {
    if (!this.wallet.sendTransaction) {
      throw new Error("Wallet does not support sending transactions");
    }

    const ixList = Array.isArray(instructions) ? instructions : [instructions];
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    // ── Pre-simulate to surface Anchor errors clearly ──
    try {
      const simTx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: this.publicKey,
      });
      ixList.forEach((ix) => simTx.add(ix));

      const simResult = await this.connection.simulateTransaction(simTx);
      if (simResult.value.err) {
        const logs = simResult.value.logs ?? [];
        console.error("🔴 Simulation error:", JSON.stringify(simResult.value.err));
        console.error("🔴 Program logs:\n", logs.join("\n"));

        const anchorLine = logs.find(
          (l) => l.includes("AnchorError") || l.includes("Error Number")
        );
        throw new Error(
          anchorLine
            ? `Simulation failed: ${anchorLine}`
            : `Simulation failed: ${JSON.stringify(simResult.value.err)}`
        );
      }
    } catch (simErr: any) {
      if (simErr.message?.startsWith("Simulation failed")) throw simErr;
      // Infra error (e.g. RPC timeout) — log and continue; let wallet try
      console.warn("Pre-simulation non-critical error:", simErr.message);
    }

    // ── Build and send the real transaction ──
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: this.publicKey });
    ixList.forEach((ix) => tx.add(ix));

    try {
      const signature = await this.wallet.sendTransaction(tx, this.connection);
      await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
      return signature;
    } catch (err: any) {
      // Unwrap WalletSendTransactionError → real cause
      const cause = err?.cause ?? err?.error ?? err;
      const msg =
        cause?.message ?? (typeof cause === "string" ? cause : JSON.stringify(cause));
      console.error("🔴 Wallet send error:", msg, cause);
      throw new Error(msg || err?.message || "Transaction failed");
    }
  }

  // ─── PDA utility ──────────────────────────────────────────────────────────

  getVaultPda(owner?: PublicKey): PublicKey {
    const ownerKey = owner || this.publicKey;
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), ownerKey.toBuffer()],
      new PublicKey(PROOF_POL_PROGRAM_ADDRESS)
    );
    return vaultPda;
  }

  // ─── Account fetching ─────────────────────────────────────────────────────

  async fetchVault(owner?: PublicKey): Promise<CommitmentVault | null> {
    const vaultPda = this.getVaultPda(owner);
    const rpc = createRpcFetcher(this.connection);
    try {
      const account = await fetchMaybeCommitmentVault(
        rpc as any,
        vaultPda.toBase58() as Address
      );
      return account.exists ? account.data : null;
    } catch (error: any) {
      // Gracefully handle stale accounts from old program deploys
      // (decoder fails if on-chain data layout doesn't match current IDL)
      if (error?.message?.includes("Failed to decode") || error?.name === "SolanaError") {
        console.warn("⚠️  Vault account exists but failed to decode (stale account from old deploy). Treating as no vault.", error.message);
        return null;
      }
      console.error("Error fetching vault:", error);
      return null;
    }
  }

  // ─── Instructions ─────────────────────────────────────────────────────────

  /**
   * Initialize a new vault.
   *
   * Automatically creates the platform USDC ATA if it doesn't exist yet
   * (first-time setup — the account is `mut` not `init_if_needed` in the program).
   * Both instructions are batched into a single wallet-approved transaction.
   */
  async initializeVault(params: InitializeVaultParams): Promise<string> {
    const owner = createMockSigner(this.publicKey);

    // ── Always ensure platform USDC ATA exists ────────────────────────────
    // Uses the idempotent ATA instruction: safe no-op if already exists,
    // creates with correct data if not. Eliminates the unreliable
    // getAccountInfo() race condition.
    const usdcMintPk = new PublicKey(params.usdcMint);
    const PLATFORM_WALLET_PUBKEY = new PublicKey(
      "99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q"
    );
    const platformUsdcAta = await getAssociatedTokenAddress(
      usdcMintPk,
      PLATFORM_WALLET_PUBKEY,
      false,
      TOKEN_PROGRAM_ID
    );

    const createPlatformAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      this.publicKey,       // payer
      platformUsdcAta,      // ATA to create
      PLATFORM_WALLET_PUBKEY,
      usdcMintPk,
      TOKEN_PROGRAM_ID
    );

    // ── Build the vault init instruction via Codama ───────────────────────
    const instruction = await getInitializeVaultInstructionAsync({
      owner,
      nominee:  address(params.nominee),
      mint:     address(params.mint),
      usdcMint: address(params.usdcMint),
      stakeAmount:     params.stakeAmount,
      checkinInterval: params.checkinIntervalSeconds,
    });

    const vaultIx = codamaToWeb3Instruction(instruction as any);

    // Send [createPlatformAta (idempotent), vaultInit] in one transaction
    return this.sendTransaction([createPlatformAtaIx, vaultIx]);
  }

  /**
   * Submit proof of life to reset the deadline.
   */
  async proofOfLife(): Promise<string> {
    const owner = createMockSigner(this.publicKey);
    const instruction = await getProofOfLifeInstructionAsync({ owner });
    return this.sendTransaction(codamaToWeb3Instruction(instruction as any));
  }

  /**
   * Close vault and withdraw tokens (owner only, before deadline).
   */
  async closeVault(mint: string): Promise<string> {
    const owner = createMockSigner(this.publicKey);
    const instruction = await getCloseVaultInstructionAsync({
      owner,
      mint: address(mint),
    });
    return this.sendTransaction(codamaToWeb3Instruction(instruction as any));
  }

  /**
   * Claim vault after deadline + grace period (permissionless).
   */
  async claimVault(params: ClaimVaultParams): Promise<string> {
    const executor = createMockSigner(this.publicKey);
    const instruction = await getClaimVaultInstructionAsync({
      executor,
      owner:   address(params.ownerAddress),
      nominee: address(params.nomineeAddress),
      mint:    address(params.mintAddress),
    });
    return this.sendTransaction(codamaToWeb3Instruction(instruction as any));
  }
}
