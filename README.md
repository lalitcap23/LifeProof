# LifeProof

**LifeProof** is a non-custodial “proof of life” protocol on Solana: you lock tokens in a program-controlled vault, set a nominee and a check-in interval, and extend your deadline by signing `proof_of_life` on time. If you stop checking in, after a grace period anyone (or an automated keeper) can call `claim_vault` and the program sends everything to the nominee — not to the caller.

On **mainnet** builds, idle liquidity can be deposited into **Kamino Finance** lending reserves so the vault earns yield as kTokens until claim or close. On **devnet** (default build), tokens stay in the vault’s associated token account with no Kamino CPI.

This repository is a full stack: **Anchor program**, **Codama-generated TypeScript client**, **Next.js dApp**, **keeper bot**, and **GitHub Actions** scheduling.

---

## Table of contents

1. [Architecture at a glance](#architecture-at-a-glance)  
2. [On-chain program (Anchor)](#on-chain-program-anchor)  
3. [Codama: IDL → TypeScript client](#codama-idl--typescript-client)  
4. [Frontend: Next.js, wallet adapter, and the Codama bridge](#frontend-nextjs-wallet-adapter-and-the-codama-bridge)  
5. [Keeper bot and automation](#keeper-bot-and-automation)  
6. [Testing](#testing)  
7. [Repository layout](#repository-layout)  
8. [Build variants and Kamino](#build-variants-and-kamino)  
9. [Accounts and PDAs](#accounts-and-pdas)  
10. [Deployments](#deployments)  
11. [Further reading](#further-reading)

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Solana cluster                                 │
│  ┌──────────────────┐    CPI / SPL      ┌─────────────────────────────┐ │
│  │   proof_pol      │ ◄──────────────► │  SPL Token, ATA, (Kamino*)   │ │
│  │   (Anchor 0.32)  │                  │  * mainnet feature only      │ │
│  └────────┬─────────┘                  └─────────────────────────────┘ │
└───────────┼────────────────────────────────────────────────────────────┘
            │
            │ JSON IDL  (anchor build)
            ▼
┌───────────────────────┐      Codama renderers      ┌────────────────────────┐
│  target/idl/          │ ────────────────────────► │  client/generated/js   │
│  proof_pol.json       │   nodes-from-anchor       │  (+ frontend lib copy) │
└───────────────────────┘                            └───────────┬────────────┘
                                                                 │
         ┌──────────────────────────────────────────────────────┼──────────────────────┐
         │                                                      │                      │
         ▼                                                      ▼                      ▼
┌─────────────────┐                                  ┌─────────────────┐    ┌──────────────┐
│  Next.js dApp   │  wallet-adapter + web3.js tx     │  ProofPolClient │    │  keeper.ts   │
│  (React 19)     │  ◄── codama instructions ───────│  (bridge layer) │    │  Anchor IDL  │
└─────────────────┘                                  └─────────────────┘    └──────────────┘
```

**Single source of truth for instructions and account layouts:** the Anchor IDL emitted by `anchor build`. **Codama** turns that IDL into typed JavaScript builders and decoders. The **frontend** wraps those builders into `TransactionInstruction` objects that `@solana/wallet-adapter` can sign. The **keeper** uses the same program semantics via the Anchor IDL and `@coral-xyz/anchor` for a different integration style (no Codama in the keeper script today).

---

## On-chain program (Anchor)

| Item | Detail |
|------|--------|
| Framework | **Anchor 0.32.1** (`anchor-lang`, `anchor-spl` with `token`, `associated_token`, `init-if-needed`) |
| Language | Rust (edition 2021), compiled to BPF / SBPF for Solana |
| Entry | `programs/proof_pol/src/lib.rs` — registers instructions and modules |
| Features | **`mainnet`** — optional Cargo feature; when enabled, Kamino deposit/redeem CPI paths compile in. Default = devnet-style vault ATA only |

### Instructions (high level)

| Instruction | Role |
|-------------|------|
| `initialize_vault` | Creates / funds the vault PDA, sets nominee, interval, mint; may CPI Kamino on mainnet |
| `proof_of_life` | Owner extends `deadline` by one interval while vault is active and not claimable |
| `claim_vault` | After `deadline + CLAIM_GRACE_PERIOD`, sends funds to nominee and closes vault-related accounts |
| `close_vault` | Owner closes while in good standing; returns funds to owner |

Custom errors live in `programs/proof_pol/src/error.rs`. Constants (grace period, Kamino pubkeys for mainnet) live in `programs/proof_pol/src/constants.rs`.

### Kamino without a conflicting CPI crate

Kamino’s on-chain interfaces often pull older `solana-program` trees than Anchor 0.32. This repo uses **raw instructions** built in `kamino_cpi.rs`: fixed 8-byte Anchor discriminators, `AccountMeta` / `invoke_signed`, and explicit account ordering. That avoids version-pinned Kamino Rust crates in the same dependency graph as the program.

---

## Codama: IDL → TypeScript client

**Codama** ([codama-idl/codama](https://github.com/codama-idl/codama)) is an IDL toolkit: it parses your program interface into an intermediate **node tree**, then **visitors** emit clients in multiple languages.

### Packages used (repo root `package.json`)

| Package | Role |
|---------|------|
| `codama` | Core CLI / library entrypoints for pipelines |
| `@codama/nodes-from-anchor` | **`rootNodeFromAnchorWithoutDefaultVisitor`** — converts Anchor JSON IDL → Codama node tree (skips Anchor’s default account visitor so your explicit accounts stay explicit) |
| `@codama/renderers` | **`renderJavaScriptVisitor`** (and optional Umi / Rust visitors, commented in generator) — emits files to a target directory |
| `@codama/visitors-core` | **`visit`** — walks the tree and runs the renderer |

### Generator script

**File:** `client/generate-client.ts`

1. Imports **`../target/idl/proof_pol.json`** (must exist after `anchor build`).
2. Casts it to **`AnchorIdl`** and builds:  
   `const node = rootNodeFromAnchorWithoutDefaultVisitor(anchorIdl)`.
3. Invokes **`visit(node, await renderJavaScriptVisitor(outputDir))`**.
4. **Output today:** `client/generated/js/src/` — JavaScript/TypeScript modules for programs, instructions, accounts, errors, shared types.

**Script:** `yarn generate:client` (see root `package.json`).

### What gets generated

Typical layout under `client/generated/js/src/`:

- **`programs/`** — program address constant, program link helpers  
- **`instructions/`** — one file per instruction (`initializeVault`, `proofOfLife`, `claimVault`, `closeVault`) with typed account metas and instruction data encoders  
- **`accounts/`** — decoders / discriminators for `CommitmentVault`, `OwnerProfile`, etc.  
- **`errors/`** — typed error codes where the IDL exposes them  
- **`shared/`** — shared types and helpers  

The **Next.js app** ships an equivalent Codama-style tree under **`frontend/src/lib/proof-pol/`** (header comment: autogenerated; do not hand-edit — regenerate and copy or wire generation into your workflow). The dApp imports `getInitializeVaultInstructionAsync`, `getClaimVaultInstructionAsync`, decoders, `PROOF_POL_PROGRAM_ADDRESS`, etc., from that tree.

### Why Codama here

- **IDL is law:** Any account list or discriminator change in Rust is reflected after rebuild + regen, reducing drift between chain and client.  
- **Typed builders:** Instruction helpers know account roles (signer / writable) from the IDL.  
- **Solana Kit alignment:** Generated code targets **`@solana/kit`** types (`Address`, `TransactionSigner`, etc.). The app still uses **`@solana/web3.js`** for `Connection`, `Transaction`, and wallet-adapter compatibility, so a thin **adapter layer** converts Codama instructions → legacy `TransactionInstruction` (see below).

---

## Frontend: Next.js, wallet adapter, and the Codama bridge

| Layer | Technology |
|-------|------------|
| Framework | **Next.js 16** (App Router) |
| UI | **React 19**, **Tailwind CSS v4** (`@import "tailwindcss"` in `globals.css`) |
| Solana RPC / txs | **`@solana/web3.js`** |
| Wallet UX | **`@solana/wallet-adapter-react`**, **`@solana/wallet-adapter-react-ui`**, **`@solana/wallet-adapter-wallets`** |
| Instruction types | **`@solana/kit`** (`address`, `TransactionSigner`) + **Codama-generated** modules under `src/lib/proof-pol/` |

**File:** `frontend/src/lib/proof-pol/client.ts` — **`ProofPolClient`**

- Calls async builders like **`getInitializeVaultInstructionAsync`** / **`getClaimVaultInstructionAsync`** with concrete `PublicKey`s and bigint amounts.  
- Converts each Codama instruction into a **`@solana/web3.js` `TransactionInstruction`** via a local **`codamaToWeb3Instruction`** mapper (maps Codama account `role` → `isSigner` / `isWritable` for legacy runtime).  
- Sends through **`wallet.sendTransaction`** after recent blockhash + optional ATA pre-instructions (e.g. WSOL wrap flow on create page).  
- **`fetchAllActiveVaults`** uses **`connection.getProgramAccounts`** with `memcmp` filters on vault discriminator and `isActive` byte offset — efficient “all active vaults” reads for the **Help Others** (`/keeper`) page.

Domain constants (mints, Kamino reserve addresses for UI-side account ordering when needed) live in **`frontend/src/lib/constants.ts`**.

---

## Keeper bot and automation

| Piece | Technology |
|-------|------------|
| Runtime | **Node.js**, **TypeScript**, **`ts-node`** |
| Solana | **`@coral-xyz/anchor`**, **`@solana/web3.js`**, **`@solana/spl-token`** |
| Interface | **`require("../target/idl/proof_pol.json")`** — uses Anchor’s IDL + program class to build `claim_vault` |

**File:** `keeper/keeper.ts`

- Loads a keypair from process environment (used in CI and locally).  
- Scans vault PDAs for the owner pattern your protocol uses, decodes deadlines, compares to `now` with the same **`CLAIM_GRACE_PERIOD`** semantics as on-chain (`172_800` seconds).  
- **`--once`** or **`CI=true`**: single scan and exit (GitHub Actions). Otherwise optional long-interval loop for a server.

**Automation:** `.github/workflows/keeper.yml` — scheduled **`cron: "0 0 */2 * *"`** (every two days UTC) plus **`workflow_dispatch`** for manual runs. The job checks out the repo, installs Node dependencies, verifies the IDL exists, and runs the keeper script.

---

## Testing

| Tool | Use |
|------|-----|
| **Anchor** | `anchor test` (see `Anchor.toml` `[scripts]` — runs **ts-mocha** on files under `tests/`) |
| **Mocha + Chai** | Assertion style in TypeScript tests |
| **solana-bankrun** / **anchor-bankrun** | Fast local ledger tests without a full `solana-test-validator` loop where configured |

Tests cover flows such as initialize, proof of life, claim, and close (see `tests/*.ts`).

---

## Repository layout

```
proof_pol/
├── Anchor.toml                 # Cluster, program id, test script
├── Cargo.toml                  # Workspace root (if present) / meta
├── package.json                # Codama + anchor + test deps; yarn generate:client
├── client/
│   ├── generate-client.ts      # Codama: IDL → client/generated/js
│   └── generated/js/src/       # Generated JS (source for syncing to frontend)
├── programs/proof_pol/        # On-chain program
│   └── src/
│       ├── lib.rs
│       ├── constants.rs
│       ├── error.rs
│       ├── kamino_cpi.rs       # Raw Kamino ix builders (mainnet feature)
│       ├── instructions/
│       └── state/
├── target/idl/proof_pol.json  # Produced by anchor build — Codama input
├── tests/                       # ts-mocha integration tests
├── frontend/                    # Next.js dApp
│   └── src/
│       ├── app/                 # Routes: /, /dashboard, /create, /keeper, /upcoming
│       ├── components/
│       ├── hooks/
│       ├── lib/proof-pol/       # Codama-generated client + ProofPolClient bridge
│       └── providers/
├── keeper/
│   └── keeper.ts                # Permissionless claim bot
└── .github/workflows/
    └── keeper.yml               # Scheduled keeper
```

---

## Build variants and Kamino

| Build | Command idea | Behavior |
|-------|----------------|----------|
| **Default (devnet)** | `anchor build` | No `mainnet` feature — vault holds tokens in vault ATA; no Kamino CPI in binary |
| **Mainnet-capable** | `anchor build -- --features mainnet` | Compiles Kamino deposit (initialize) and redeem (claim/close) paths |

Always verify **reserve accounts, market, mints, and instruction ordering** against the current Kamino deployment before production; raw CPI is powerful but must match live interfaces.

---

## Accounts and PDAs

| Account | Seeds | Role |
|---------|--------|------|
| **OwnerProfile** | `[b"owner_profile", owner]` | Tracks per-owner `vault_id` counter for the next vault index |
| **CommitmentVault** | `[b"vault", owner, vault_id.to_le_bytes()]` | One PDA per (owner, vault id); stores nominee, mint, stake, deadline, `isActive`, Kamino-related fields on mainnet |
| **vault_ata** | ATA(owner = vault PDA, mint) | Custodies SPL (or staging liquidity around Kamino redeem on mainnet) |
| **nominee_ata** | ATA(nominee, mint) | Destination on claim; may be created idempotently by payer |

Exact struct layouts and bumps are defined in the Anchor program; the IDL and Codama account decoders match those layouts.

---

## Deployments

| Network | Program ID |
|---------|------------|
| **Devnet** | `DHHHbFFGWX2y4HkgdePB61bUZxdJQw8VmfGvgR4cxeof` |
| **Mainnet** | Deploy and record when ready |

---

## Further reading

- **Codama:** [github.com/codama-idl/codama](https://github.com/codama-idl/codama)  
- **Anchor:** [anchor-lang.com](https://www.anchor-lang.com/)  
- **Solana wallet adapter:** [github.com/anza-xyz/wallet-adapter](https://github.com/anza-xyz/wallet-adapter)  
- **Kamino:** [kamino.finance](https://kamino.finance/) — verify program IDs and reserve metadata for your target cluster

---

*LifeProof: programmable inheritance and accountability, with the interface generated from the same IDL that defines the chain’s behavior.*
