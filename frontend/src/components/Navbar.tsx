"use client";

import { FC } from "react";
import Link from "next/link";
import { WalletButton } from "./WalletButton";

export const Navbar: FC = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">LP</span>
            </div>
            <span className="text-xl font-bold text-white">LifeProof</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/create"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Create Vault
            </Link>
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
};
