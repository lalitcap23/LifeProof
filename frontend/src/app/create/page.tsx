"use client";

import { useState, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import { useProofPol } from "@/hooks/useProofPol";
import { USDC_MINT } from "@/lib/constants";
import { getErrorMessage } from "@/lib/error";

const WSOL_MINT = NATIVE_MINT.toBase58();

const TOKEN_OPTIONS = [
  {
    id: "usdc",
    label: "USDC",
    mint: USDC_MINT,
    decimals: 6,
    icon: "💵",
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

export default function CreateVault() {
  const { publicKey, connected } = useWallet();
  const wallet = useWallet();
  const { connection } = useConnection();
  const router = useRouter();

  const { initializeVault, loading, error, vaults } = useProofPol();

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

  const stakeAmountUnits = useMemo(() => {
    const n = parseFloat(stakeAmount);
    if (isNaN(n) || n <= 0) return BigInt(0);
    return BigInt(Math.floor(n * Math.pow(10, selectedToken.decimals)));
  }, [stakeAmount, selectedToken.decimals]);

  async function wrapSol(lamports: bigint): Promise<string> {
    if (!publicKey || !wallet.sendTransaction)
      throw new Error("Wallet not connected");

    const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
    const tx = new Transaction();

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        wsolAta,
        publicKey,
        NATIVE_MINT
      )
    );
    tx.add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: wsolAta,
        lamports: Number(lamports),
      })
    );
    tx.add(createSyncNativeInstruction(wsolAta));

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey;

    const sig = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction({
      signature: sig,
      blockhash,
      lastValidBlockHeight,
    });
    return wsolAta.toBase58();
  }

  async function unwrapSol() {
    if (!publicKey || !wallet.sendTransaction) return;
    try {
      const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
      const info = await connection.getAccountInfo(wsolAta);
      if (!info) return;

      const tx = new Transaction().add(
        createCloseAccountInstruction(wsolAta, publicKey, publicKey)
      );
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({
        signature: sig,
        blockhash,
        lastValidBlockHeight,
      });
    } catch (e) {
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

      if (selectedToken.id === "sol") {
        setWrapping(true);
        await wrapSol(stakeAmountUnits);
        mintToUse = WSOL_MINT;
        setWrapping(false);
      }

      const signature = await initializeVault({
        nominee,
        mint: mintToUse,
        usdcMint: USDC_MINT,
        stakeAmount: stakeAmountUnits,
        checkinIntervalSeconds: BigInt(interval),
      });

      console.log("Vault created! Signature:", signature);
      setTxSignature(signature);

      if (selectedToken.id === "sol") {
        await unwrapSol();
      }

      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: unknown) {
      console.error("Error creating vault:", err);
      setWrapping(false);
      alert(
        `Failed to create vault: ${getErrorMessage(err) || "Unknown error"}`
      );
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-stone-900 mb-2">Connect Your Wallet</h1>
          <p className="text-sm text-stone-500">
            Please connect your wallet to create a vault
          </p>
        </div>
      </div>
    );
  }

  const isBusy = loading || wrapping;
  const busyLabel = wrapping ? "Wrapping SOL…" : "Creating Vault…";

  return (
    <div className="min-h-screen bg-[#FAFAF8] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] font-bold text-amber-600 tracking-widest uppercase mb-1">
            New Vault
          </p>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">
            Create Commitment Vault
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Stake tokens and set up a proof-of-life commitment
          </p>
        </div>

        {vaults.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-sm">ℹ</span>
            <p className="text-sm text-amber-800">
              You already have {vaults.length} vault{vaults.length === 1 ? "" : "s"}.
              Creating a new one will use the next vault ID automatically.
            </p>
          </div>
        )}

        {/* What happens next */}
        <div className="mb-6 bg-stone-950 border border-stone-800 rounded-xl p-5 font-mono text-xs">
          <p className="text-[10px] text-stone-500 uppercase tracking-widest mb-3">› what happens on creation</p>
          <div className="space-y-1.5">
            {[
              { step: "1.", text: "vault PDA derived from [\"vault\", owner_pubkey]", color: "text-stone-300" },
              { step: "2.", text: "tokens transferred to vault_ata (program-controlled)", color: "text-stone-300" },
              { step: "3.", text: "(mainnet) deposit_reserve_liquidity → Kamino reserve", color: "text-amber-400" },
              { step: "4.", text: "(mainnet) kTokens minted to vault_ktoken_ata", color: "text-amber-400" },
              { step: "5.", text: "deadline = now + checkin_interval", color: "text-stone-300" },
              { step: "6.", text: "is_active = true — clock starts now", color: "text-green-400" },
            ].map((r) => (
              <div key={r.step} className="flex gap-3">
                <span className="text-stone-600 shrink-0">{r.step}</span>
                <span className={r.color}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden shadow-sm"
        >
          {/* ── Token Selector ── */}
          <div className="p-6">
            <label className="block text-xs font-bold text-stone-900 uppercase tracking-widest mb-3">
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
                    className={`relative flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all duration-200 text-left ${
                      isActive
                        ? "border-amber-500 bg-amber-50"
                        : "border-stone-200 bg-white hover:border-stone-400"
                    }`}
                  >
                    <span className="text-xl">{token.icon}</span>
                    <div>
                      <div className={`font-bold text-sm ${isActive ? "text-amber-700" : "text-stone-700"}`}>
                        {token.label}
                      </div>
                      <div className="text-xs text-stone-400">
                        {token.id === "sol" ? "Native SOL" : "Stablecoin"}
                      </div>
                    </div>
                    {isActive && (
                      <span className="ml-auto w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                          <path
                            d="M10 3L5 8.5 2 5.5"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedToken.id === "sol" && (
              <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 flex items-start gap-2">
                <span className="text-stone-400 mt-0.5 text-xs">ℹ</span>
                <p className="text-xs text-stone-500 leading-relaxed">
                  SOL will be wrapped into wSOL before depositing into the vault.
                  Any leftover wSOL is automatically unwrapped after creation.
                </p>
              </div>
            )}
          </div>

          {/* ── Nominee Address ── */}
          <div className="p-6">
            <label htmlFor="nominee" className="block text-xs font-bold text-stone-900 uppercase tracking-widest mb-2">
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
              className={`w-full bg-white border ${
                nomineeError ? "border-red-300" : "border-stone-200"
              } rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-colors`}
            />
            {nomineeError && (
              <p className="mt-1.5 text-xs text-red-500 font-medium">{nomineeError}</p>
            )}
            <p className="mt-1.5 text-xs text-stone-400">
              This address will be able to claim your stake if you miss check-ins
            </p>
          </div>

          {/* ── Stake Amount ── */}
          <div className="p-6">
            <label htmlFor="stakeAmount" className="block text-xs font-bold text-stone-900 uppercase tracking-widest mb-2">
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
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 pr-20 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-400">
                {selectedToken.label}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-stone-400">{selectedToken.hint}</p>
          </div>

          {/* ── Check-in Interval ── */}
          <div className="p-6">
            <label className="block text-xs font-bold text-stone-900 uppercase tracking-widest mb-3">
              Check-in Interval
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
              {INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedInterval(option.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    selectedInterval === option.value
                      ? "bg-amber-600 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
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
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 pr-24 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-stone-400 font-medium">
                  seconds
                </span>
              </div>
            )}
            <p className="mt-1.5 text-xs text-stone-400">
              How often you need to prove you&apos;re alive to keep your stake
            </p>
          </div>

          {/* ── Summary ── */}
          {nominee && stakeAmount && (selectedInterval > 0 || customInterval) && (
            <div className="p-6 bg-stone-50">
              <h3 className="text-[10px] font-bold text-stone-900 uppercase tracking-widest mb-4">
                Summary
              </h3>
              <div className="space-y-2.5">
                {[
                  {
                    label: "Token",
                    value: `${selectedToken.icon} ${selectedToken.label}`,
                  },
                  {
                    label: "Stake",
                    value: `${stakeAmount} ${selectedToken.label}`,
                  },
                  ...(selectedToken.id === "usdc"
                    ? [{ label: "Platform fee", value: "1 USDC" }]
                    : []),
                  {
                    label: "Check-in every",
                    value:
                      selectedInterval === 0
                        ? `${customInterval} seconds`
                        : INTERVAL_OPTIONS.find((o) => o.value === selectedInterval)?.label,
                  },
                  {
                    label: "Nominee",
                    value: `${nominee.slice(0, 8)}...${nominee.slice(-8)}`,
                    mono: true,
                  },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-xs text-stone-500">{row.label}</span>
                    <span
                      className={`text-xs font-semibold text-stone-900 ${
                        row.mono ? "font-mono" : ""
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Success ── */}
          {txSignature && (
            <div className="p-6 bg-amber-50 border-t border-amber-100">
              <h3 className="text-sm font-bold text-amber-800 mb-2">
                ✓ Vault Created Successfully!
              </h3>
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 hover:text-amber-800 text-xs font-mono break-all transition-colors"
              >
                View transaction: {txSignature.slice(0, 20)}...
              </a>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="p-6 bg-white border-t border-red-100">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* ── Submit ── */}
          <div className="p-6 space-y-4">
            <button
              type="submit"
              disabled={isBusy || !nominee || !stakeAmount}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm tracking-wide"
            >
              {isBusy ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
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
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { tag: "NON-CUSTODIAL", desc: "Tokens go to vault PDA, not to any team wallet" },
                { tag: "IMMUTABLE NOMINEE", desc: "Nominee address cannot be changed after creation" },
                { tag: "48H GRACE", desc: "2-day buffer before anyone can trigger a claim" },
              ].map((s) => (
                <div key={s.tag} className="text-center">
                  <span className="inline-block text-[8px] font-mono font-bold text-amber-600 tracking-widest bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded mb-1">
                    {s.tag}
                  </span>
                  <p className="text-[10px] text-stone-400 leading-tight">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
