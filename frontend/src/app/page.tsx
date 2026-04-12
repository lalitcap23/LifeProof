"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

export default function Home() {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 bg-black rounded-full" />
            <span className="text-xs font-medium text-gray-600 tracking-wide uppercase">
              Built on Solana
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-black mb-6 leading-none">
            Commitment
            <br />
            <span className="text-gray-400">Staking Protocol</span>
          </h1>

          <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
            Stake SOL and commit to regular check-ins. Miss your deadline and
            your nominee claims the stake. Stay accountable, stay alive.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {connected ? (
              <>
                <Link
                  href="/create"
                  className="bg-black hover:bg-gray-800 text-white font-medium py-3 px-8 rounded-lg transition-colors text-sm"
                >
                  Create Vault
                </Link>
                <Link
                  href="/dashboard"
                  className="bg-white hover:bg-gray-50 text-black font-medium py-3 px-8 rounded-lg transition-colors border border-gray-200 text-sm"
                >
                  View Dashboard
                </Link>
              </>
            ) : (
              <p className="text-gray-400 text-sm">
                Connect your wallet to get started
              </p>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black tracking-tight">How It Works</h2>
            <p className="text-gray-500 mt-2 text-sm">Four simple steps</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Create Vault",
                desc: "Stake SOL and designate a nominee with a check-in interval",
                accent: false,
              },
              {
                step: "02",
                title: "Prove Life",
                desc: "Sign a transaction before your deadline to extend it",
                accent: false,
              },
              {
                step: "03",
                title: "Stay Active",
                desc: "Keep checking in to maintain your stake and commitment",
                accent: false,
              },
              {
                step: "!",
                title: "Or Lose It",
                desc: "Miss your deadline and your nominee can claim the stake",
                accent: true,
              },
            ].map((item) => (
              <div key={item.step} className="text-center group">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 text-lg font-bold transition-transform group-hover:-translate-y-1 ${
                    item.accent
                      ? "bg-black text-white"
                      : "bg-white border-2 border-gray-200 text-black"
                  }`}
                >
                  {item.step}
                </div>
                <h3 className="text-base font-semibold text-black mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black tracking-tight">Features</h2>
            <p className="text-gray-500 mt-2 text-sm">Everything you need to commit</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                ),
                title: "Secure Staking",
                desc: "SOL is locked in a program-controlled PDA. Only the owner or nominee can withdraw under specific conditions.",
              },
              {
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ),
                title: "Flexible Intervals",
                desc: "Choose your own check-in cadence — daily, weekly, monthly, or custom intervals that fit your lifestyle.",
              },
              {
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                ),
                title: "Nominee System",
                desc: "Designate a trusted party who inherits your stake if you become inactive.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-black hover:shadow-lg transition-all duration-200 group"
              >
                <div className="w-10 h-10 bg-gray-100 group-hover:bg-black group-hover:text-white rounded-xl flex items-center justify-center mb-5 text-black transition-colors duration-200">
                  {feature.icon}
                </div>
                <h3 className="text-base font-semibold text-black mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-100">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-black rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">LP</span>
            </div>
            <span className="text-sm font-medium text-black">LifeProof</span>
          </div>
          <p className="text-xs text-gray-400">Built on Solana. Open source.</p>
        </div>
      </footer>
    </div>
  );
}
