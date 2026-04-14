"use client";

import { FC } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (module) => module.WalletMultiButton
    ),
  {
    ssr: false,
      loading: () => (
      <button className="bg-amber-600 rounded-lg py-2 px-4 text-sm font-medium text-white opacity-50">
        Loading...
      </button>
    ),
  }
);

export const WalletButton: FC = () => {
  const { connected, publicKey } = useWallet();

  return (
    <div className="flex items-center gap-3">
      {connected && publicKey && (
        <span className="text-xs font-mono text-stone-500 bg-stone-100 px-2.5 py-1 rounded-md">
          {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
        </span>
      )}
      <WalletMultiButton className="!bg-amber-600 hover:!bg-amber-700 !rounded-lg !py-2 !px-4 !text-sm !font-semibold !transition-colors !text-white" />
    </div>
  );
};
