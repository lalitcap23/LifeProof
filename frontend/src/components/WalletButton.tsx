"use client";

import { FC } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export const WalletButton: FC = () => {
  const { connected, publicKey } = useWallet();

  return (
    <div className="flex items-center gap-4">
      {connected && publicKey && (
        <span className="text-sm text-gray-400">
          {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
        </span>
      )}
      <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !py-2 !px-4 !text-sm !font-medium !transition-colors" />
    </div>
  );
};
