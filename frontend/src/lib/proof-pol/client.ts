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
import bs58 from "bs58";

import {
  getInitializeVaultInstructionAsync,
  getProofOfLifeInstruction,
  getCloseVaultInstructionAsync,
  getClaimVaultInstructionAsync,
  getCommitmentVaultDiscriminatorBytes,
  getOwnerProfileDiscriminatorBytes,
  type CommitmentVault,
  type OwnerProfile,
  PROOF_POL_PROGRAM_ADDRESS,
} from "./index";
import { getCommitmentVaultDecoder } from "./accounts/commitmentVault";
import { getOwnerProfileDecoder } from "./accounts/ownerProfile";

export { PROOF_POL_PROGRAM_ADDRESS };
export type { CommitmentVault };

function codamaToWeb3Instruction(codamaInstruction: {
  programAddress: Address;
  accounts: readonly { address: Address; role: number; signer?: unknown }[];
  data: Uint8Array;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(codamaInstruction.programAddress),
    keys: codamaInstruction.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.address),
      isSigner: acc.role >= 2,
      isWritable: acc.role === 1 || acc.role === 3,
    })),
    data: Buffer.from(codamaInstruction.data),
  });
}

function createMockSigner(publicKey: PublicKey): TransactionSigner {
  return { address: publicKey.toBase58() as Address } as TransactionSigner;
}

// Direct byte decoder — avoids the @solana/kit RPC adapter which expects
// base64-encoded data in [string, 'base64'] format, not raw Uint8Array.
function decodeVaultBytes(data: Buffer | Uint8Array): CommitmentVault | null {
  try {
    return getCommitmentVaultDecoder().decode(new Uint8Array(data));
  } catch (err) {
    console.warn("CommitmentVault decode failed:", err);
    return null;
  }
}

function decodeOwnerProfileBytes(data: Buffer | Uint8Array): OwnerProfile | null {
  try {
    return getOwnerProfileDecoder().decode(new Uint8Array(data));
  } catch (err) {
    console.warn("OwnerProfile decode failed:", err);
    return null;
  }
}

function u64ToSeed(value: bigint): Uint8Array {
  const seed = new Uint8Array(8);
  const view = new DataView(seed.buffer);
  view.setBigUint64(0, value, true);
  return seed;
}

const COMMITMENT_VAULT_DISCRIMINATOR = Uint8Array.from(
  getCommitmentVaultDiscriminatorBytes()
);

const OWNER_PROFILE_DISCRIMINATOR = Uint8Array.from(
  getOwnerProfileDiscriminatorBytes()
);

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

export interface CloseVaultParams {
  mint: string;
  vaultAddress: string;
}

export interface ClaimVaultParams {
  ownerAddress: string;
  nomineeAddress: string;
  mintAddress: string;
  vaultAddress: string;
}

export interface VaultAccountData {
  address: string;
  data: CommitmentVault;
}

const FALLBACK_VAULT_SCAN_COUNT = 16;

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

  private async sendTransaction(
    instructions: TransactionInstruction | TransactionInstruction[]
  ): Promise<string> {
    if (!this.wallet.sendTransaction) {
      throw new Error("Wallet does not support sending transactions");
    }

    const ixList = Array.isArray(instructions) ? instructions : [instructions];
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    try {
      const simTx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: this.publicKey,
      });
      ixList.forEach((ix) => simTx.add(ix));

      const simResult = await this.connection.simulateTransaction(simTx);
      if (simResult.value.err) {
        const logs = simResult.value.logs ?? [];
        console.error("Simulation error:", JSON.stringify(simResult.value.err));
        console.error("Program logs:\n", logs.join("\n"));

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
      console.warn("Pre-simulation non-critical error:", simErr.message);
    }

    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: this.publicKey });
    ixList.forEach((ix) => tx.add(ix));

    try {
      const signature = await this.wallet.sendTransaction(tx, this.connection);
      await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
      return signature;
    } catch (err: any) {
      const cause = err?.cause ?? err?.error ?? err;
      const msg =
        cause?.message ?? (typeof cause === "string" ? cause : JSON.stringify(cause));
      console.error("Wallet send error:", msg, cause);
      throw new Error(msg || err?.message || "Transaction failed");
    }
  }

  getOwnerProfilePda(owner?: PublicKey): PublicKey {
    const ownerKey = owner || this.publicKey;
    const [ownerProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("owner_profile"), ownerKey.toBuffer()],
      new PublicKey(PROOF_POL_PROGRAM_ADDRESS)
    );
    return ownerProfilePda;
  }

  getVaultPda(vaultId: bigint | number, owner?: PublicKey): PublicKey {
    const ownerKey = owner || this.publicKey;
    const normalizedVaultId = typeof vaultId === "number" ? BigInt(vaultId) : vaultId;
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), ownerKey.toBuffer(), u64ToSeed(normalizedVaultId)],
      new PublicKey(PROOF_POL_PROGRAM_ADDRESS)
    );
    return vaultPda;
  }

  async fetchOwnerProfile(owner?: PublicKey): Promise<OwnerProfile | null> {
    const ownerProfilePda = this.getOwnerProfilePda(owner);
    const accountInfo = await this.connection.getAccountInfo(ownerProfilePda);

    if (!accountInfo) return null;

    if (accountInfo.data.length < OWNER_PROFILE_DISCRIMINATOR.length) {
      return null;
    }

    const discriminator = accountInfo.data.subarray(0, OWNER_PROFILE_DISCRIMINATOR.length);
    const matchesDiscriminator = OWNER_PROFILE_DISCRIMINATOR.every(
      (byte, index) => discriminator[index] === byte
    );

    if (!matchesDiscriminator) {
      console.warn("OwnerProfile discriminator mismatch — stale program deployment?");
      return null;
    }

    return decodeOwnerProfileBytes(accountInfo.data);
  }

  async getNextVaultId(owner?: PublicKey): Promise<bigint> {
    const ownerProfile = await this.fetchOwnerProfile(owner);
    return ownerProfile?.nextVaultId ?? BigInt(0);
  }

  private async findNextAvailableVaultId(owner?: PublicKey): Promise<bigint> {
    let vaultId = await this.getNextVaultId(owner);

    for (let attempts = 0; attempts < 256; attempts += 1) {
      const vaultPda = this.getVaultPda(vaultId, owner);
      const existingVaultAccount = await this.connection.getAccountInfo(vaultPda);

      if (!existingVaultAccount) {
        return vaultId;
      }

      vaultId += BigInt(1);
    }

    throw new Error("Could not find a free vault id for this wallet.");
  }

  async fetchVaultByAddress(vaultAddress: PublicKey | string): Promise<CommitmentVault | null> {
    const vaultAddressString =
      typeof vaultAddress === "string" ? vaultAddress : vaultAddress.toBase58();
    const accountInfo = await this.connection.getAccountInfo(new PublicKey(vaultAddressString));

    if (!accountInfo) return null;

    if (accountInfo.data.length < COMMITMENT_VAULT_DISCRIMINATOR.length) {
      return null;
    }

    const discriminator = accountInfo.data.subarray(0, COMMITMENT_VAULT_DISCRIMINATOR.length);
    const matchesDiscriminator = COMMITMENT_VAULT_DISCRIMINATOR.every(
      (byte, index) => discriminator[index] === byte
    );

    if (!matchesDiscriminator) {
      return null;
    }

    return decodeVaultBytes(accountInfo.data);
  }

  async fetchVaults(owner?: PublicKey): Promise<VaultAccountData[]> {
    const ownerKey = owner || this.publicKey;
    const vaultDiscriminator = bs58.encode(COMMITMENT_VAULT_DISCRIMINATOR);
    const rawAccounts = await this.connection.getProgramAccounts(
      new PublicKey(PROOF_POL_PROGRAM_ADDRESS),
      {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: vaultDiscriminator,
            },
          },
          {
            memcmp: {
              offset: 8,
              bytes: ownerKey.toBase58(),
            },
          },
        ],
      }
    );

    const ownerProfile = await this.fetchOwnerProfile(ownerKey);
    const scanCount = Number(
      ownerProfile?.nextVaultId && ownerProfile.nextVaultId > BigInt(FALLBACK_VAULT_SCAN_COUNT)
        ? ownerProfile.nextVaultId
        : BigInt(FALLBACK_VAULT_SCAN_COUNT)
    );

    const candidateAddresses = new Set(rawAccounts.map((account) => account.pubkey.toBase58()));

    for (let index = 0; index < scanCount; index += 1) {
      candidateAddresses.add(this.getVaultPda(index, ownerKey).toBase58());
    }

    const decodedVaults = await Promise.all(
      Array.from(candidateAddresses).map(async (vaultAddress) => {
        const data = await this.fetchVaultByAddress(vaultAddress);
        if (!data || data.owner !== ownerKey.toBase58()) return null;
        return {
          address: vaultAddress,
          data,
        };
      })
    );

    return decodedVaults
      .filter((vault): vault is VaultAccountData => vault !== null)
      .sort((a, b) => Number(a.data.vaultId - b.data.vaultId));
  }

  async initializeVault(params: InitializeVaultParams): Promise<string> {
    const owner = createMockSigner(this.publicKey);
    const ownerProfilePda = this.getOwnerProfilePda();
    const nextVaultId = await this.findNextAvailableVaultId();
    const vaultPda = this.getVaultPda(nextVaultId);

    const usdcMintPk = new PublicKey(params.usdcMint);
    const platformWalletPubkey = new PublicKey(
      "99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q"
    );
    const platformUsdcAta = await getAssociatedTokenAddress(
      usdcMintPk,
      platformWalletPubkey,
      false,
      TOKEN_PROGRAM_ID
    );

    const createPlatformAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      this.publicKey,
      platformUsdcAta,
      platformWalletPubkey,
      usdcMintPk,
      TOKEN_PROGRAM_ID
    );

    const instruction = await getInitializeVaultInstructionAsync({
      owner,
      nominee: address(params.nominee),
      ownerProfile: address(ownerProfilePda.toBase58()),
      vault: address(vaultPda.toBase58()),
      mint: address(params.mint),
      usdcMint: address(params.usdcMint),
      vaultId: nextVaultId,
      stakeAmount: params.stakeAmount,
      checkinInterval: params.checkinIntervalSeconds,
    });

    const vaultIx = codamaToWeb3Instruction(instruction as any);
    return this.sendTransaction([createPlatformAtaIx, vaultIx]);
  }

  async proofOfLife(vaultAddress: string): Promise<string> {
    const owner = createMockSigner(this.publicKey);
    const instruction = getProofOfLifeInstruction({
      owner,
      vault: address(vaultAddress),
    });
    return this.sendTransaction(codamaToWeb3Instruction(instruction as any));
  }

  async closeVault(params: CloseVaultParams): Promise<string> {
    const owner = createMockSigner(this.publicKey);
    const instruction = await getCloseVaultInstructionAsync({
      owner,
      vault: address(params.vaultAddress),
      mint: address(params.mint),
    });
    return this.sendTransaction(codamaToWeb3Instruction(instruction as any));
  }

  async claimVault(params: ClaimVaultParams): Promise<string> {
    const executor = createMockSigner(this.publicKey);
    const instruction = await getClaimVaultInstructionAsync({
      executor,
      owner: address(params.ownerAddress),
      nominee: address(params.nomineeAddress),
      vault: address(params.vaultAddress),
      mint: address(params.mintAddress),
    });
    return this.sendTransaction(codamaToWeb3Instruction(instruction as any));
  }
}
