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
      ? "bg-black text-white"
      : "bg-gray-100 text-gray-700 border border-gray-200"
    : "bg-gray-100 text-gray-400 border border-gray-100";

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-black hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">
            Vault #{vaultId.toString()}
          </p>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses}`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-black">
            {formatStakeAmount(stakeAmount, mint)}
          </p>
          <p className="text-xs text-gray-400 font-mono truncate max-w-40 mt-0.5">
            {mint}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mb-5" />

      {/* Details */}
      <div className="space-y-3 mb-5">
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Owner</p>
          <p className="text-xs text-gray-700 font-mono truncate max-w-48">{owner}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Nominee</p>
          <p className="text-xs text-gray-700 font-mono truncate max-w-48">{nominee}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Deadline</p>
          <p
            className={`text-sm font-semibold ${
              isExpired ? "text-black" : "text-gray-700"
            }`}
          >
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
              className="flex-1 bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
            >
              {loading ? "Processing…" : "Proof of Life"}
            </button>
          )}
          {isOwner && !isExpired && onClose && (
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-white hover:bg-gray-50 disabled:bg-gray-50 disabled:cursor-not-allowed text-black text-sm font-medium py-2.5 px-4 rounded-lg transition-colors border border-gray-200 hover:border-gray-400"
            >
              {loading ? "Processing…" : "Close Vault"}
            </button>
          )}
          {isExpired && onClaim && (
            <button
              onClick={onClaim}
              disabled={loading}
              className="flex-1 bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
            >
              {loading ? "Processing…" : "Claim Stake"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
