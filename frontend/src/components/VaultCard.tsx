"use client";

import { FC } from "react";
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
  const now = Math.floor(Date.now() / 1000);
  const isExpired = deadline < now;
  const timeRemaining = formatTimeRemaining(deadline);

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-colors">
      <div className="flex justify-between items-start mb-4 gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
            Vault #{vaultId.toString()}
          </p>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isActive
                ? isExpired
                  ? "bg-red-900 text-red-300"
                  : "bg-green-900 text-green-300"
                : "bg-gray-700 text-gray-400"
            }`}
          >
            {isActive ? (isExpired ? "Claimable" : "Active") : "Closed"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{formatStakeAmount(stakeAmount, mint)}</p>
          <p className="text-sm text-gray-400 font-mono truncate max-w-44">{mint}</p>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Owner</p>
          <p className="text-sm text-gray-300 font-mono truncate">{owner}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Nominee</p>
          <p className="text-sm text-gray-300 font-mono truncate">{nominee}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Deadline</p>
          <p
            className={`text-sm font-semibold ${
              isExpired ? "text-red-400" : "text-green-400"
            }`}
          >
            {timeRemaining}
          </p>
        </div>
      </div>

      {isActive && (
        <div className="flex gap-3">
          {isOwner && !isExpired && onProofOfLife && (
            <button
              onClick={onProofOfLife}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Processing..." : "Proof of Life"}
            </button>
          )}
          {isOwner && !isExpired && onClose && (
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Processing..." : "Close Vault"}
            </button>
          )}
          {isExpired && onClaim && (
            <button
              onClick={onClaim}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Processing..." : "Claim Stake"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
