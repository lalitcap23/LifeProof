/**
 * Bridge between wallet-adapter (web3.js 1.x) and Codama client (@solana/kit)
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Signer,
} from "@solana/web3.js";
import { type WalletContextState } from "@solana/wallet-adapter-react";
import { address, type Address, type TransactionSigner } from "@solana/kit";

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

/**
 * Convert Codama instruction to web3.js 1.x TransactionInstruction
 */
function codamaToWeb3Instruction(
  codamaInstruction: {
    programAddress: Address;
    accounts: readonly { address: Address; role: number; signer?: unknown }[];
    data: Uint8Array;
  }
): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(codamaInstruction.programAddress),
    keys: codamaInstruction.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.address),
      isSigner: acc.role >= 2, // 2 = signer, 3 = writable signer
      isWritable: acc.role % 2 === 1 || acc.role === 3, // 1 = writable, 3 = writable signer
    })),
    data: Buffer.from(codamaInstruction.data),
  });
}

/**
 * Create a mock TransactionSigner from wallet public key
 * The actual signing is done by wallet-adapter, not this signer
 */
function createMockSigner(publicKey: PublicKey): TransactionSigner {
  const addr = publicKey.toBase58() as Address;
  return {
    address: addr,
  } as TransactionSigner;
}

/**
 * Create RPC-like object for fetching accounts
 * Codama's @solana/kit expects: rpc.getAccountInfo(addr).send() pattern
 */
function createRpcFetcher(connection: Connection) {
  return {
    getAccountInfo: (addr: Address, _config?: any) => ({
      send: async () => {
        const accountInfo = await connection.getAccountInfo(new PublicKey(addr));
        if (!accountInfo) {
          return { value: null };
        }
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

/**
 * ProofPol Client - bridges Codama with wallet-adapter
 */
export class ProofPolClient {
  private connection: Connection;
  private wallet: WalletContextState;

  constructor(config: ProofPolClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
  }

  private get publicKey(): PublicKey {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }
    return this.wallet.publicKey;
  }

  /**
   * Send a transaction with the wallet.
   * Surfaces the real simulation error from the wallet error object.
   */
  private async sendTransaction(
    instruction: TransactionInstruction
  ): Promise<string> {
    if (!this.wallet.sendTransaction) {
      throw new Error("Wallet does not support sending transactions");
    }

    // Pre-simulate so we can log program errors before the wallet rejects
    try {
      const simResult = await this.connection.simulateTransaction(
        new Transaction({
          recentBlockhash: (await this.connection.getLatestBlockhash()).blockhash,
          feePayer: this.publicKey,
        }).add(instruction)
      );
      if (simResult.value.err) {
        console.error("🔴 Simulation error:", JSON.stringify(simResult.value.err));
        console.error("🔴 Program logs:", simResult.value.logs?.join("\n"));
        const logs = simResult.value.logs ?? [];
        const anchorMsg = logs.find((l) => l.includes("AnchorError") || l.includes("Error Number"));
        if (anchorMsg) {
          throw new Error(`Simulation failed: ${anchorMsg}`);
        }
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simResult.value.err)}\n\nLogs:\n${logs.join("\n")}`
        );
      }
    } catch (simErr: any) {
      // Only re-throw if it's our own error (not a simulation infra error)
      if (simErr.message?.startsWith("Simulation failed") || simErr.message?.startsWith("Transaction simulation failed")) {
        throw simErr;
      }
      console.warn("Pre-simulation threw (non-critical):", simErr);
    }

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.publicKey;

    try {
      const signature = await this.wallet.sendTransaction(
        transaction,
        this.connection
      );
      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      return signature;
    } catch (err: any) {
      // Unwrap WalletSendTransactionError → real cause
      const cause = err?.cause ?? err?.error ?? err;
      const msg =
        cause?.message ??
        (typeof cause === "string" ? cause : JSON.stringify(cause));
      console.error("🔴 sendTransaction real error:", msg, cause);
      throw new Error(msg || err?.message || "Transaction failed");
    }
  }

  /**
   * Get vault PDA address for a given owner
   */
  getVaultPda(owner?: PublicKey): PublicKey {
    const ownerKey = owner || this.publicKey;
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), ownerKey.toBuffer()],
      new PublicKey(PROOF_POL_PROGRAM_ADDRESS)
    );
    return vaultPda;
  }

  /**
   * Fetch vault data using Codama decoder
   */
  async fetchVault(owner?: PublicKey): Promise<CommitmentVault | null> {
    const vaultPda = this.getVaultPda(owner);
    const rpc = createRpcFetcher(this.connection);

    try {
      const account = await fetchMaybeCommitmentVault(
        rpc as any,
        vaultPda.toBase58() as Address
      );
      return account.exists ? account.data : null;
    } catch (error) {
      console.error("Error fetching vault:", error);
      return null;
    }
  }

  /**
   * Initialize a new vault
   */
  async initializeVault(params: InitializeVaultParams): Promise<string> {
    const owner = createMockSigner(this.publicKey);

    const instruction = await getInitializeVaultInstructionAsync({
      owner,
      nominee: address(params.nominee),
      mint: address(params.mint),
      usdcMint: address(params.usdcMint),
      stakeAmount: params.stakeAmount,
      checkinInterval: params.checkinIntervalSeconds,
    });

    const web3Instruction = codamaToWeb3Instruction(instruction as any);
    return this.sendTransaction(web3Instruction);
  }

  /**
   * Submit proof of life to reset deadline
   */
  async proofOfLife(): Promise<string> {
    const owner = createMockSigner(this.publicKey);

    const instruction = await getProofOfLifeInstructionAsync({
      owner,
    });

    const web3Instruction = codamaToWeb3Instruction(instruction as any);
    return this.sendTransaction(web3Instruction);
  }

  /**
   * Close vault and withdraw tokens (owner only, before deadline)
   */
  async closeVault(mint: string): Promise<string> {
    const owner = createMockSigner(this.publicKey);

    const instruction = await getCloseVaultInstructionAsync({
      owner,
      mint: address(mint),
    });

    const web3Instruction = codamaToWeb3Instruction(instruction as any);
    return this.sendTransaction(web3Instruction);
  }

  /**
   * Claim vault after deadline + grace period (anyone can execute)
   */
  async claimVault(params: ClaimVaultParams): Promise<string> {
    const executor = createMockSigner(this.publicKey);

    const instruction = await getClaimVaultInstructionAsync({
      executor,
      owner: address(params.ownerAddress),
      nominee: address(params.nomineeAddress),
      mint: address(params.mintAddress),
    });

    const web3Instruction = codamaToWeb3Instruction(instruction as any);
    return this.sendTransaction(web3Instruction);
  }
}
