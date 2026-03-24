"use client";

import { FC, ReactNode } from "react";
import { WalletProvider } from "@/providers";
import { Navbar } from "@/components";

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: FC<AppProviderProps> = ({ children }) => {
  return (
    <WalletProvider>
      <Navbar />
      <main className="pt-16">{children}</main>
    </WalletProvider>
  );
};
