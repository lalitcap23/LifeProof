# LifeProof

A dead man's switch protocol on Solana. Lock tokens into a vault with a check-in deadline — if you stop signing in, your nominated wallet automatically inherits the funds. On mainnet, idle funds earn yield via Kamino Finance while they wait.

---

## How it works

1. **Create a vault** — deposit tokens, set a nominee wallet and a check-in interval (e.g. every 30 days).
2. **Prove you're alive** — sign a `proof_of_life` transaction before the deadline to roll it forward.
3. **Miss the deadline** — anyone (including an automated keeper bot) can call `claim_vault` to transfer the funds to the nominee.
4. **Change your mind** — call `close_vault` at any time while active to get your funds back.

On **mainnet**, deposited tokens are routed into Kamino lending reserves and earn APY as kTokens. On **devnet**, tokens stay in the vault ATA.

---

## Program instructions

| Instruction | Who calls it | What it does |
|---|---|---|
| `initialize_vault` | Owner | Creates vault PDA, deposits tokens, sets nominee + interval |
| `proof_of_life` | Owner | Rolls the deadline forward by one interval |
| `claim_vault` | Nominee or keeper | Transfers funds to nominee after deadline passes |
| `close_vault` | Owner | Returns funds to owner, closes vault |

---

## Project structure

```
programs/proof_pol/   Anchor on-chain program (Rust)
frontend/             Next.js dApp (TypeScript, Tailwind)
keeper/               Permissionless keeper bot (TypeScript)
.github/workflows/    GitHub Actions — runs keeper every 2 days
```

---

## Local development

**Requirements:** Rust, Solana CLI, Anchor 0.32, Node.js 18+

```bash
# Build the program
anchor build

# Run tests
anchor test

# Start the frontend
cd frontend && npm install && npm run dev
```

---

## Keeper bot

The keeper scans devnet for vaults past their deadline and executes `claim_vault` on their behalf. It pays for any missing ATAs and recovers the cost from the vault's reclaimed rent.

```bash
cd keeper
export KEEPER_KEYPAIR='[1,2,3,...]'   # base58 or JSON array
npx ts-node keeper.ts --once
```

A GitHub Actions workflow (`.github/workflows/keeper.yml`) runs the bot automatically every 2 days. Add `KEEPER_KEYPAIR` as a repository secret to activate it.

---

## Accounts

| Account | Seeds | Description |
|---|---|---|
| `CommitmentVault` | `["vault", owner]` | Vault state PDA |
| `vault_ata` | ATA of vault PDA | Holds deposited tokens (or kTokens on mainnet) |
| `nominee_ata` | ATA of nominee | Receives tokens on successful claim |

---

## Deployments

| Network | Program ID |
|---|---|
| Devnet | `DHHHbFFGWX2y4HkgdePB61bUZxdJQw8VmfGvgR4cxeof` |
| Mainnet | TBD |
