"use client";

import { FC, useSyncExternalStore } from "react";
import { NATIVE_MINT } from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";
import { formatTimeRemaining } from "@/lib/utils";

interface VaultCardProps {
  vaultId: bigint;
  mint: string;
  owner: string;
  nominee: string;
  stakeAmount: bigint;
  deadline: number;
  isActive: boolean;
  isOwner: boolean;
  onProofOfLife?: () => void;
  onClaim?: () => void;
  onClose?: () => void;
  loading?: boolean;
}

function formatStakeAmount(stakeAmount: bigint, mint: string) {
  if (mint === NATIVE_MINT.toBase58()) {
    return `${(Number(stakeAmount) / 1e9).toFixed(4)} SOL`;
  }
  if (mint === USDC_MINT) {
    return `${(Number(stakeAmount) / 1e6).toFixed(2)} USDC`;
  }
  return `${stakeAmount.toString()} units`;
}

function subscribeToCurrentTime(callback: () => void) {
  const intervalId = window.setInterval(callback, 60_000);
  return () => window.clearInterval(intervalId);
}

function getCurrentUnixTime() {
  return Math.floor(Date.now() / 1000);
}

export const VaultCard: FC<VaultCardProps> = ({
  vaultId,
  mint,
  owner,
  nominee,
  stakeAmount,
  deadline,
  isActive,
  isOwner,
  onProofOfLife,
  onClaim,
  onClose,
  loading = false,
}) => {
  const now = useSyncExternalStore(
    subscribeToCurrentTime,
    getCurrentUnixTime,
    () => 0
  );
  const isExpired = deadline < now;
  const timeRemaining = formatTimeRemaining(deadline, now);

  const statusLabel = isActive ? (isExpired ? "Claimable" : "Active") : "Closed";

  const statusClasses = isActive
    ? isExpired
      ? "bg-amber-600 text-white"
      : "bg-stone-100 text-stone-700 border border-stone-200"
    : "bg-stone-100 text-stone-400 border border-stone-100";

  return (
    <div className="bg-white rounded-xl p-6 border border-stone-200 hover:border-amber-300 hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 gap-4">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">
            Vault #{vaultId.toString()}
          </p>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusClasses}`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-stone-900">
            {formatStakeAmount(stakeAmount, mint)}
          </p>
          <p className="text-[10px] text-stone-400 font-mono truncate max-w-40 mt-0.5">
            {mint.slice(0, 8)}...{mint.slice(-6)}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-stone-100 mb-5" />

      {/* Details */}
      <div className="space-y-3 mb-5">
        <div className="flex justify-between items-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-widest font-semibold">Owner</p>
          <p className="text-xs text-stone-600 font-mono truncate max-w-48">{owner}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-widest font-semibold">Nominee</p>
          <p className="text-xs text-stone-600 font-mono truncate max-w-48">{nominee}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-widest font-semibold">Deadline</p>
          <p className={`text-sm font-bold ${isExpired ? "text-amber-600" : "text-stone-700"}`}>
            {isExpired ? "⚠ " : ""}{timeRemaining}
          </p>
        </div>
      </div>

      {/* Actions */}
      {isActive && (
        <div className="flex gap-2 pt-1">
          {isOwner && !isExpired && onProofOfLife && (
            <button
              onClick={onProofOfLife}
              disabled={loading}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              {loading ? "Processing…" : "Proof of Life"}
            </button>
          )}
          {isOwner && !isExpired && onClose && (
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-white hover:bg-stone-50 disabled:bg-stone-50 disabled:cursor-not-allowed text-stone-700 text-sm font-medium py-2.5 px-4 rounded-lg transition-colors border border-stone-200 hover:border-stone-400"
            >
              {loading ? "Processing…" : "Close Vault"}
            </button>
          )}
          {isExpired && onClaim && (
            <button
              onClick={onClaim}
              disabled={loading}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              {loading ? "Processing…" : "Claim Stake"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
