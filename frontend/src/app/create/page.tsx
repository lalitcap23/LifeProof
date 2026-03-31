"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useProofPol } from "@/hooks/useProofPol";

const INTERVAL_OPTIONS = [
  { label: "1 Hour", value: 3600 },
  { label: "1 Day", value: 86400 },
  { label: "1 Week", value: 604800 },
  { label: "30 Days", value: 2592000 },
  { label: "Custom", value: 0 },
];

// USDC mint on devnet - replace with mainnet address for production
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
// Default stake token mint (can be USDC or any SPL token)
const DEFAULT_STAKE_MINT = USDC_MINT;

export default function CreateVault() {
  const { publicKey, connected } = useWallet();
  const router = useRouter();

  // Use our Codama-powered hook
  const { initializeVault, loading, error, vault } = useProofPol();

  const [nominee, setNominee] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [selectedInterval, setSelectedInterval] = useState(86400);
  const [customInterval, setCustomInterval] = useState("");
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const [nomineeError, setNomineeError] = useState("");

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
      // Convert USDC amount to raw token units (USDC has 6 decimals)
      const stakeAmountUnits = BigInt(Math.floor(stake * 1_000_000));

      // Call the Codama-generated instruction through our hook
      const signature = await initializeVault({
        nominee: nominee,
        mint: DEFAULT_STAKE_MINT,
        usdcMint: USDC_MINT,
        stakeAmount: stakeAmountUnits,
        checkinIntervalSeconds: BigInt(interval),
      });

      console.log("Vault created! Signature:", signature);
      setTxSignature(signature);

      // Navigate to dashboard after success
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: any) {
      console.error("Error creating vault:", err);
      alert(`Failed to create vault: ${err.message || "Unknown error"}`);
    }
  };

  // Redirect if user already has a vault
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

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Create Commitment Vault</h1>
          <p className="text-gray-400">
            Stake USDC and set up your proof-of-life commitment
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6"
        >
          {/* Nominee Address */}
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
              This address will be able to claim your stake if you miss
              check-ins
            </p>
          </div>

          {/* Stake Amount */}
          <div>
            <label
              htmlFor="stakeAmount"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Stake Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                id="stakeAmount"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                USDC
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Amount of USDC to stake in the commitment vault (minimum 10 USDC)
            </p>
          </div>

          {/* Check-in Interval */}
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

          {/* Success Message */}
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

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Summary */}
          {nominee && stakeAmount && (selectedInterval > 0 || customInterval) && (
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Stake</span>
                  <span className="text-white">{stakeAmount} USDC</span>
                </div>
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

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !nominee || !stakeAmount}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? "Creating Vault..." : "Create Vault"}
          </button>
        </form>
      </div>
    </div>
  );
}
