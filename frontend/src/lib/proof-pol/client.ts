/**
 * Bridge between wallet-adapter (web3.js 1.x) and Codama client (@solana/kit)
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
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
import { getErrorMessage, getNestedErrorValue } from "../error";
import {
  CLUSTER,
  KAMINO_LENDING_MARKET,
  KAMINO_LENDING_MARKET_AUTHORITY,
  KAMINO_LENDING_PROGRAM_ID,
  KAMINO_SOL_COLLATERAL_MINT,
  KAMINO_SOL_LIQUIDITY_SUPPLY,
  KAMINO_SOL_RESERVE,
  KAMINO_USDC_COLLATERAL_MINT,
  KAMINO_USDC_LIQUIDITY_SUPPLY,
  KAMINO_USDC_RESERVE,
  MINT_WSOL,
  USDC_MINT,
} from "../constants";

export { PROOF_POL_PROGRAM_ADDRESS };
export type { CommitmentVault };

type CodamaInstruction = Parameters<typeof codamaToWeb3Instruction>[0];

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

// CommitmentVault minimum byte size:
// 8 (discriminator) + 32+8+32+32+8+8+8+8+1+1+1+32+8 (struct fields) = 187
const COMMITMENT_VAULT_MIN_BYTES = 187;

// Direct byte decoder — avoids the @solana/kit RPC adapter which expects
// base64-encoded data in [string, 'base64'] format, not raw Uint8Array.
function decodeVaultBytes(data: Buffer | Uint8Array): CommitmentVault | null {
  // Silently skip accounts that are too small — they are stale vaults from
  // a previous program deployment with fewer struct fields.
  if (data.length < COMMITMENT_VAULT_MIN_BYTES) return null;
  try {
    return getCommitmentVaultDecoder().decode(new Uint8Array(data));
  } catch (err) {
    console.warn("CommitmentVault decode failed:", err);
    return null;
  }
}

function decodeOwnerProfileBytes(
  data: Buffer | Uint8Array
): OwnerProfile | null {
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
const SYSTEM_PROGRAM_ADDRESS = SystemProgram.programId.toBase58();

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
        const tokenErrorLine = logs.find((l) =>
          /insufficient funds|InsufficientFunds|Error: insufficient/i.test(l)
        );
        const programErrorLine = logs
          .reverse()
          .find((l) => /Program log: Error/i.test(l));

        const detail =
          anchorLine ??
          tokenErrorLine ??
          programErrorLine ??
          JSON.stringify(simResult.value.err);

        throw new Error(`Simulation failed: ${detail}`);
      }
    } catch (simErr: unknown) {
      const simMessage = getErrorMessage(simErr);
      if (simMessage.startsWith("Simulation failed")) throw simErr;
      console.warn("Pre-simulation non-critical error:", simMessage);
    }

    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: this.publicKey,
    });
    ixList.forEach((ix) => tx.add(ix));

    try {
      const signature = await this.wallet.sendTransaction(tx, this.connection);
      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      return signature;
    } catch (err: unknown) {
      const cause =
        getNestedErrorValue(err, "cause") ??
        getNestedErrorValue(err, "error") ??
        err;
      const msg = getErrorMessage(cause);
      console.error("Wallet send error:", msg, cause);
      throw new Error(msg || getErrorMessage(err) || "Transaction failed");
    }
  }

  private getDevnetPlaceholderMint(mintPk: PublicKey): PublicKey {
    const usdcMintPk = new PublicKey(USDC_MINT);
    return mintPk.equals(usdcMintPk) ? new PublicKey(MINT_WSOL) : usdcMintPk;
  }

  private async getKaminoAccounts(
    mintPk: PublicKey,
    vaultPda: PublicKey,
    fallbackAta: PublicKey,
    options?: {
      kTokenMintOverride?: PublicKey;
    }
  ) {
    let kTokenMint: PublicKey;
    let kaminoReserve: PublicKey;
    let kaminoLendingMarket: PublicKey;
    let kaminoLendingMarketAuthority: PublicKey;
    let kaminoLiquiditySupply: PublicKey;

    // Use Kamino CPI only on non-devnet and for supported tokens
    if (
      CLUSTER !== "devnet" &&
      (mintPk.toBase58() === USDC_MINT || mintPk.toBase58() === MINT_WSOL)
    ) {
      if (mintPk.toBase58() === USDC_MINT) {
        kTokenMint = new PublicKey(KAMINO_USDC_COLLATERAL_MINT);
        kaminoReserve = new PublicKey(KAMINO_USDC_RESERVE);
        kaminoLiquiditySupply = new PublicKey(KAMINO_USDC_LIQUIDITY_SUPPLY);
      } else {
        kTokenMint = new PublicKey(KAMINO_SOL_COLLATERAL_MINT);
        kaminoReserve = new PublicKey(KAMINO_SOL_RESERVE);
        kaminoLiquiditySupply = new PublicKey(KAMINO_SOL_LIQUIDITY_SUPPLY);
      }
      kaminoLendingMarket = new PublicKey(KAMINO_LENDING_MARKET);
      kaminoLendingMarketAuthority = new PublicKey(
        KAMINO_LENDING_MARKET_AUTHORITY
      );
    } else {
      // Devnet keeps funds in vault_ata, but Anchor still validates the
      // placeholder Kamino accounts. Use a distinct mint so vault_ata and
      // vault_k_token_ata do not collapse to the same ATA.
      kTokenMint =
        options?.kTokenMintOverride ?? this.getDevnetPlaceholderMint(mintPk);
      kaminoReserve = SystemProgram.programId;
      kaminoLendingMarket = SystemProgram.programId;
      kaminoLendingMarketAuthority = SystemProgram.programId;
      kaminoLiquiditySupply = fallbackAta;
    }

    const vaultKTokenAta = await getAssociatedTokenAddress(
      kTokenMint,
      vaultPda,
      true, // allowOwnerOffCurve = true (vaultPda is a PDA)
      TOKEN_PROGRAM_ID
    );

    return {
      kTokenMint: address(kTokenMint.toBase58()),
      kaminoReserve: address(kaminoReserve.toBase58()),
      kaminoLendingMarket: address(kaminoLendingMarket.toBase58()),
      kaminoLendingMarketAuthority: address(
        kaminoLendingMarketAuthority.toBase58()
      ),
      kaminoLiquiditySupply: address(kaminoLiquiditySupply.toBase58()),
      kaminoLendingProgram: address(KAMINO_LENDING_PROGRAM_ID),
      instructionSysvar: address(SYSVAR_INSTRUCTIONS_PUBKEY.toBase58()),
      vaultKTokenAta: address(vaultKTokenAta.toBase58()),
    };
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
    const normalizedVaultId =
      typeof vaultId === "number" ? BigInt(vaultId) : vaultId;
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

    const discriminator = accountInfo.data.subarray(
      0,
      OWNER_PROFILE_DISCRIMINATOR.length
    );
    const matchesDiscriminator = OWNER_PROFILE_DISCRIMINATOR.every(
      (byte, index) => discriminator[index] === byte
    );

    if (!matchesDiscriminator) {
      console.warn(
        "OwnerProfile discriminator mismatch — stale program deployment?"
      );
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
      const existingVaultAccount = await this.connection.getAccountInfo(
        vaultPda
      );

      if (!existingVaultAccount) {
        return vaultId;
      }

      vaultId += BigInt(1);
    }

    throw new Error("Could not find a free vault id for this wallet.");
  }

  async fetchVaultByAddress(
    vaultAddress: PublicKey | string
  ): Promise<CommitmentVault | null> {
    const vaultAddressString =
      typeof vaultAddress === "string" ? vaultAddress : vaultAddress.toBase58();
    const accountInfo = await this.connection.getAccountInfo(
      new PublicKey(vaultAddressString)
    );

    if (!accountInfo) return null;

    if (accountInfo.data.length < COMMITMENT_VAULT_DISCRIMINATOR.length) {
      return null;
    }

    const discriminator = accountInfo.data.subarray(
      0,
      COMMITMENT_VAULT_DISCRIMINATOR.length
    );
    const matchesDiscriminator = COMMITMENT_VAULT_DISCRIMINATOR.every(
      (byte, index) => discriminator[index] === byte
    );

    if (!matchesDiscriminator) {
      return null;
    }

    return decodeVaultBytes(accountInfo.data);
  }

  /**
   * Fetch ALL active vaults across the entire protocol (no owner filter).
   * Used by the Good Samaritan / keeper dashboard to find claimable vaults.
   *
   * Offset 144 in CommitmentVault = isActive byte (1 = active).
   * Layout: 8 disc + 32 owner + 8 vaultId + 32 nominee + 32 mint
   *       + 8 stakeAmount + 8 checkinInterval + 8 lastCheckin + 8 deadline
   *       = 144 → isActive
   */
  async fetchAllActiveVaults(): Promise<VaultAccountData[]> {
    const vaultDiscriminator = bs58.encode(COMMITMENT_VAULT_DISCRIMINATOR);
    const isActiveByte = bs58.encode(Buffer.from([1]));

    const rawAccounts = await this.connection.getProgramAccounts(
      new PublicKey(PROOF_POL_PROGRAM_ADDRESS),
      {
        filters: [
          { memcmp: { offset: 0,   bytes: vaultDiscriminator } },
          { memcmp: { offset: 144, bytes: isActiveByte } },
        ],
      }
    );

    return rawAccounts
      .map(({ pubkey, account }) => {
        const data = decodeVaultBytes(account.data);
        if (!data) return null;
        return { address: pubkey.toBase58(), data };
      })
      .filter((v): v is VaultAccountData => v !== null);
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
      ownerProfile?.nextVaultId &&
        ownerProfile.nextVaultId > BigInt(FALLBACK_VAULT_SCAN_COUNT)
        ? ownerProfile.nextVaultId
        : BigInt(FALLBACK_VAULT_SCAN_COUNT)
    );

    const candidateAddresses = new Set(
      rawAccounts.map((account) => account.pubkey.toBase58())
    );

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

    const createPlatformAtaIx =
      createAssociatedTokenAccountIdempotentInstruction(
        this.publicKey,
        platformUsdcAta,
        platformWalletPubkey,
        usdcMintPk,
        TOKEN_PROGRAM_ID
      );

    const mintPk = new PublicKey(params.mint);
    const ownerAtaPk = await getAssociatedTokenAddress(mintPk, this.publicKey);

    // Pre-flight balance checks — surface clearer errors than the SPL Token
    // program's opaque `Custom: 1` (InsufficientFunds) at simulation time.
    const PLATFORM_FEE_USDC = BigInt(1_000_000); // 1 USDC (6 decimals)
    const ownerUsdcAtaPk = await getAssociatedTokenAddress(
      usdcMintPk,
      this.publicKey
    );

    const [usdcBalance, stakeBalance] = await Promise.all([
      this.connection
        .getTokenAccountBalance(ownerUsdcAtaPk)
        .then((r) => BigInt(r.value.amount))
        .catch(() => BigInt(0)),
      mintPk.equals(usdcMintPk)
        ? Promise.resolve<bigint | null>(null)
        : this.connection
            .getTokenAccountBalance(ownerAtaPk)
            .then((r) => BigInt(r.value.amount))
            .catch(() => BigInt(0)),
    ]);

    if (usdcBalance < PLATFORM_FEE_USDC) {
      throw new Error(
        `Insufficient USDC for the 1 USDC platform fee (have ${
          Number(usdcBalance) / 1_000_000
        } USDC). Fund your wallet with USDC and try again.`
      );
    }

    if (mintPk.equals(usdcMintPk)) {
      // Stake is also USDC — the fee comes from the same ATA.
      if (usdcBalance < PLATFORM_FEE_USDC + params.stakeAmount) {
        throw new Error(
          `Insufficient USDC: need ${
            Number(PLATFORM_FEE_USDC + params.stakeAmount) / 1_000_000
          } USDC (stake + 1 USDC fee), have ${
            Number(usdcBalance) / 1_000_000
          }.`
        );
      }
    } else if (stakeBalance !== null && stakeBalance < params.stakeAmount) {
      throw new Error(
        `Insufficient stake-token balance: need ${params.stakeAmount.toString()} raw units, have ${stakeBalance.toString()}.`
      );
    }
    
    // Get Kamino accounts (dummies on devnet, real on mainnet)
    const kaminoAccounts = await this.getKaminoAccounts(mintPk, vaultPda, ownerAtaPk);

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
      ...kaminoAccounts,
    });

    const vaultIx = codamaToWeb3Instruction(
      instruction as unknown as CodamaInstruction
    );
    return this.sendTransaction([createPlatformAtaIx, vaultIx]);
  }

  async proofOfLife(vaultAddress: string): Promise<string> {
    const owner = createMockSigner(this.publicKey);
    const instruction = getProofOfLifeInstruction({
      owner,
      vault: address(vaultAddress),
    });
    return this.sendTransaction(
      codamaToWeb3Instruction(instruction as unknown as CodamaInstruction)
    );
  }

  async closeVault(params: CloseVaultParams): Promise<string> {
    const owner = createMockSigner(this.publicKey);
    const vaultPda = new PublicKey(params.vaultAddress);
    const mintPk = new PublicKey(params.mint);

    // On close, vaultATA always exists; we use that as fallback
    const vaultAtaPk = await getAssociatedTokenAddress(
      mintPk,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const vaultData = await this.fetchVaultByAddress(vaultPda);
    const storedKTokenMint =
      vaultData && vaultData.kTokenMint !== SYSTEM_PROGRAM_ADDRESS
        ? new PublicKey(vaultData.kTokenMint)
        : undefined;
    const kaminoAccounts = await this.getKaminoAccounts(
      mintPk,
      vaultPda,
      vaultAtaPk,
      { kTokenMintOverride: storedKTokenMint }
    );

    const instruction = await getCloseVaultInstructionAsync({
      owner,
      vault: address(params.vaultAddress),
      mint: address(params.mint),
      ...kaminoAccounts,
    });
    return this.sendTransaction(
      codamaToWeb3Instruction(instruction as unknown as CodamaInstruction)
    );
  }

  async claimVault(params: ClaimVaultParams): Promise<string> {
    const executor = createMockSigner(this.publicKey);
    const vaultPda = new PublicKey(params.vaultAddress);
    const mintPk = new PublicKey(params.mintAddress);

    // On claim, vaultATA always exists; we use that as fallback
    const vaultAtaPk = await getAssociatedTokenAddress(
      mintPk,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const vaultData = await this.fetchVaultByAddress(vaultPda);
    const storedKTokenMint =
      vaultData && vaultData.kTokenMint !== SYSTEM_PROGRAM_ADDRESS
        ? new PublicKey(vaultData.kTokenMint)
        : undefined;
    const kaminoAccounts = await this.getKaminoAccounts(
      mintPk,
      vaultPda,
      vaultAtaPk,
      { kTokenMintOverride: storedKTokenMint }
    );

    const instruction = await getClaimVaultInstructionAsync({
      executor,
      owner: address(params.ownerAddress),
      nominee: address(params.nomineeAddress),
      vault: address(params.vaultAddress),
      mint: address(params.mintAddress),
      ...kaminoAccounts,
    });

    const ix = codamaToWeb3Instruction(instruction as unknown as CodamaInstruction);

    
    const nomineeIndex = ix.keys.findIndex(
      (k) => k.pubkey.toBase58() === params.nomineeAddress
    );
    if (nomineeIndex !== -1) {
      ix.keys[nomineeIndex].isWritable = true;
    }

    return this.sendTransaction(ix);
  }
}
