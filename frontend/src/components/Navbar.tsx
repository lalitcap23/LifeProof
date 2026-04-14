"use client";

import { FC } from "react";
import Link from "next/link";
import { WalletButton } from "./WalletButton";

export const Navbar: FC = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs tracking-tight">LP</span>
            </div>
            <span className="text-xl font-bold text-black tracking-tight">LifeProof</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-600 hover:text-black transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/create"
              className="text-sm font-medium text-gray-600 hover:text-black transition-colors"
            >
              Create Vault
            </Link>
            <Link
              href="/keeper"
              className="text-sm font-medium text-gray-600 hover:text-black transition-colors flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-black inline-block" />
              Help Others
            </Link>
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
};
