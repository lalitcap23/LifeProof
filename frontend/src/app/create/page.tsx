"use client";

import { useState, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import { useProofPol } from "@/hooks/useProofPol";
import { USDC_MINT } from "@/lib/constants";

// ─── Token options ────────────────────────────────────────────────────────────
const WSOL_MINT = NATIVE_MINT.toBase58(); // So1111...1112

const TOKEN_OPTIONS = [
  {
    id: "usdc",
    label: "USDC",
    mint: USDC_MINT,
    decimals: 6,
    icon: "💵",
    color: "from-blue-500 to-cyan-500",
    min: "10",
    step: "0.01",
    hint: "Minimum 10 USDC (program enforced). A 1 USDC platform fee is charged on creation.",
  },
  {
    id: "sol",
    label: "SOL",
    mint: WSOL_MINT,
    decimals: 9,
    icon: "◎",
    color: "from-purple-500 to-violet-500",
    min: "0.01",
    step: "0.001",
    hint: "Minimum 0.01 SOL. SOL is wrapped into wSOL for on-chain staking.",
  },
];

const INTERVAL_OPTIONS = [
  { label: "1 Hour", value: 3600 },
  { label: "1 Day", value: 86400 },
  { label: "1 Week", value: 604800 },
  { label: "30 Days", value: 2592000 },
  { label: "Custom", value: 0 },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function CreateVault() {
  const { publicKey, connected } = useWallet();
  const wallet = useWallet();
  const { connection } = useConnection();
  const router = useRouter();

  const { initializeVault, loading, error, vault } = useProofPol();

  // Form state
  const [selectedToken, setSelectedToken] = useState(TOKEN_OPTIONS[0]);
  const [nominee, setNominee] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [selectedInterval, setSelectedInterval] = useState(86400);
  const [customInterval, setCustomInterval] = useState("");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [nomineeError, setNomineeError] = useState("");
  const [wrapping, setWrapping] = useState(false);

  const validateNominee = (value: string) => {
    if (!value) {
      setNomineeError("Nominee address is required");
      return false;
    }
    try {
      new PublicKey(value);
      setNomineeError("");
      return true;
    } catch {
      setNomineeError("Invalid Solana address");
      return false;
    }
  };

  // Raw units from human-readable amount
  const stakeAmountUnits = useMemo(() => {
    const n = parseFloat(stakeAmount);
    if (isNaN(n) || n <= 0) return BigInt(0);
    return BigInt(Math.floor(n * Math.pow(10, selectedToken.decimals)));
  }, [stakeAmount, selectedToken.decimals]);

  /**
   * Wrap native SOL into a wSOL ATA so the program can treat it as an SPL token.
   * Returns the wSOL ATA address.
   */
  async function wrapSol(lamports: bigint): Promise<string> {
    if (!publicKey || !wallet.sendTransaction) throw new Error("Wallet not connected");

    const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
    const tx = new Transaction();

    // Create wSOL ATA if it doesn't exist yet
    try {
      const info = await connection.getAccountInfo(wsolAta);
      if (!info) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            wsolAta,
            publicKey,
            NATIVE_MINT
          )
        );
      }
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(
          publicKey,
          wsolAta,
          publicKey,
          NATIVE_MINT
        )
      );
    }

    // Transfer SOL into the wSOL ATA
    tx.add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: wsolAta,
        lamports: lamports,
      })
    );

    // Sync native: marks the SOL balance as token balance
    tx.add(createSyncNativeInstruction(wsolAta));

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey;

    const sig = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });

    return wsolAta.toBase58();
  }

  /**
   * After vault is created, close the wSOL ATA to recover any remaining SOL.
   */
  async function unwrapSol() {
    if (!publicKey || !wallet.sendTransaction) return;
    try {
      const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
      const info = await connection.getAccountInfo(wsolAta);
      if (!info) return; // already closed or doesn't exist

      const tx = new Transaction().add(
        createCloseAccountInstruction(wsolAta, publicKey, publicKey)
      );
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    } catch (e) {
      // Non-critical — log and continue
      console.warn("Could not unwrap leftover wSOL:", e);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected || !publicKey) {
      alert("Please connect your wallet first");
      return;
    }
    if (!validateNominee(nominee)) return;

    const stake = parseFloat(stakeAmount);
    if (isNaN(stake) || stake <= 0) {
      alert("Please enter a valid stake amount");
      return;
    }

    const interval =
      selectedInterval === 0 ? parseInt(customInterval) : selectedInterval;
    if (isNaN(interval) || interval <= 0) {
      alert("Please enter a valid check-in interval");
      return;
    }

    try {
      let mintToUse = selectedToken.mint;

      // ── SOL path: wrap first ──────────────────────────────────────────────
      if (selectedToken.id === "sol") {
        setWrapping(true);
        await wrapSol(stakeAmountUnits);
        mintToUse = WSOL_MINT;
        setWrapping(false);
      }

      // ── Call the program ──────────────────────────────────────────────────
      const signature = await initializeVault({
        nominee,
        mint: mintToUse,
        usdcMint: USDC_MINT,
        stakeAmount: stakeAmountUnits,
        checkinIntervalSeconds: BigInt(interval),
      });

      console.log("Vault created! Signature:", signature);
      setTxSignature(signature);

      // ── SOL path: unwrap leftover ─────────────────────────────────────────
      if (selectedToken.id === "sol") {
        await unwrapSol();
      }

      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: any) {
      console.error("Error creating vault:", err);
      setWrapping(false);
      alert(`Failed to create vault: ${err.message || "Unknown error"}`);
    }
  };

  // ── Guard: already has vault ──────────────────────────────────────────────
  if (vault) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">You Already Have a Vault</h1>
          <p className="text-gray-400 mb-4">
            Each wallet can only have one active vault.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Guard: wallet not connected ───────────────────────────────────────────
  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="text-gray-400">
            Please connect your wallet to create a vault
          </p>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  const isBusy = loading || wrapping;
  const busyLabel = wrapping ? "Wrapping SOL…" : "Creating Vault…";

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Create Commitment Vault</h1>
          <p className="text-gray-400">
            Stake tokens and set up your proof-of-life commitment
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6"
        >
          {/* ── Token Selector ── */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Stake Token
            </label>
            <div className="grid grid-cols-2 gap-3">
              {TOKEN_OPTIONS.map((token) => {
                const isActive = selectedToken.id === token.id;
                return (
                  <button
                    key={token.id}
                    type="button"
                    onClick={() => {
                      setSelectedToken(token);
                      setStakeAmount("");
                    }}
                    className={`relative flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all duration-200 ${
                      isActive
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-gray-600 bg-gray-900 hover:border-gray-500"
                    }`}
                  >
                    {/* gradient bar at top when active */}
                    {isActive && (
                      <div
                        className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-xl bg-gradient-to-r ${token.color}`}
                      />
                    )}
                    <span className="text-2xl">{token.icon}</span>
                    <div className="text-left">
                      <div
                        className={`font-semibold text-sm ${
                          isActive ? "text-white" : "text-gray-300"
                        }`}
                      >
                        {token.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {token.id === "sol" ? "Native SOL" : "Stablecoin"}
                      </div>
                    </div>
                    {isActive && (
                      <span className="ml-auto w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 12 12"
                        >
                          <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedToken.id === "sol" && (
              <div className="mt-2 flex items-start gap-2 bg-violet-950/40 border border-violet-700/50 rounded-lg px-3 py-2">
                <span className="text-violet-400 mt-0.5">ℹ</span>
                <p className="text-xs text-violet-300">
                  SOL will be wrapped into wSOL (Wrapped SOL) before depositing
                  into the vault. Any leftover wSOL is automatically unwrapped
                  back to SOL after creation.
                </p>
              </div>
            )}
          </div>

          {/* ── Nominee Address ── */}
          <div>
            <label
              htmlFor="nominee"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Nominee Address
            </label>
            <input
              type="text"
              id="nominee"
              value={nominee}
              onChange={(e) => {
                setNominee(e.target.value);
                if (e.target.value) validateNominee(e.target.value);
              }}
              placeholder="Enter nominee's Solana wallet address"
              className={`w-full bg-gray-900 border ${
                nomineeError ? "border-red-500" : "border-gray-700"
              } rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
            {nomineeError && (
              <p className="mt-1 text-sm text-red-400">{nomineeError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              This address will be able to claim your stake if you miss check-ins
            </p>
          </div>

          {/* ── Stake Amount ── */}
          <div>
            <label
              htmlFor="stakeAmount"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Stake Amount ({selectedToken.label})
            </label>
            <div className="relative">
              <input
                type="number"
                id="stakeAmount"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="0.00"
                step={selectedToken.step}
                min={selectedToken.min}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 pr-20 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <span
                className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium bg-gradient-to-r ${selectedToken.color} bg-clip-text text-transparent`}
              >
                {selectedToken.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{selectedToken.hint}</p>
          </div>

          {/* ── Check-in Interval ── */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Check-in Interval
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
              {INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedInterval(option.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedInterval === option.value
                      ? "bg-purple-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {selectedInterval === 0 && (
              <div className="relative">
                <input
                  type="number"
                  value={customInterval}
                  onChange={(e) => setCustomInterval(e.target.value)}
                  placeholder="Enter seconds"
                  min="60"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                  seconds
                </span>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              How often you need to prove you&apos;re alive to keep your stake
            </p>
          </div>

          {/* ── Success Message ── */}
          {txSignature && (
            <div className="bg-green-900/50 border border-green-500 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-400 mb-2">
                Vault Created Successfully!
              </h3>
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-300 hover:text-green-200 text-xs font-mono break-all"
              >
                View transaction: {txSignature.slice(0, 20)}...
              </a>
            </div>
          )}

          {/* ── Error Message ── */}
          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* ── Summary ── */}
          {nominee && stakeAmount && (selectedInterval > 0 || customInterval) && (
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Token</span>
                  <span className="text-white flex items-center gap-1">
                    <span>{selectedToken.icon}</span>
                    {selectedToken.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Stake</span>
                  <span className="text-white">
                    {stakeAmount} {selectedToken.label}
                  </span>
                </div>
                {selectedToken.id === "usdc" && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Platform fee</span>
                    <span className="text-yellow-400">1 USDC</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Check-in every</span>
                  <span className="text-white">
                    {selectedInterval === 0
                      ? `${customInterval} seconds`
                      : INTERVAL_OPTIONS.find(
                          (o) => o.value === selectedInterval
                        )?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Nominee</span>
                  <span className="text-white font-mono text-xs">
                    {nominee.slice(0, 8)}...{nominee.slice(-8)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={isBusy || !nominee || !stakeAmount}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isBusy ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                {busyLabel}
              </>
            ) : (
              `Create Vault with ${selectedToken.label}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
