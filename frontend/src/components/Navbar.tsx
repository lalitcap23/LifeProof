"use client";

import { FC } from "react";
import Link from "next/link";
import { WalletButton } from "./WalletButton";

export const Navbar: FC = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#FAFAF8]/90 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs tracking-tight">LP</span>
            </div>
            <span className="text-xl font-bold text-stone-900 tracking-tight">Aegis Vault</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/create"
              className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              Create Vault
            </Link>
            <Link
              href="/keeper"
              className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              Help Others
            </Link>
            <Link
              href="/upcoming"
              className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1.5"
            >
              Upcoming
              <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide leading-none">
                New
              </span>
            </Link>
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
};
