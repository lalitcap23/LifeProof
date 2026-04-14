# Proof-of-Life — Keeper Bot (Devnet)

The keeper bot watches all active vaults on devnet. When a vault owner misses their check-in and the 2-day grace period expires, the keeper automatically calls `claim_vault` to send the funds to the nominee's wallet.


## How It Works (Step by Step)

```
Bot starts
    │
    ├─ Scan 1 (runs immediately)
    │       │
    │       ├── fetchAllVaults()     → getProgramAccounts filtered by discriminator
    │       ├── filter isActive=true
    │       ├── for each vault:
    │       │       check: now >= deadline + 172800s (2 days)?
    │       │       YES → call claim_vault → tokens go to nominee wallet
    │       │       NO  → log "waiting Xh" and skip
    │       └── log summary
    │
    └─ Sleep 48 hours → Scan 2 → Sleep → Scan 3 → ...
```


## Prerequisites

- Node.js v18+
- `ts-node` and `typescript` (already in root devDependencies)
- A funded devnet wallet (0.1 SOL is enough for months)
- The program must be deployed: `anchor build && anchor deploy`

---

## Setup — 4 Steps

### Step 1 — Generate the Keeper Wallet

```bash
solana-keygen new --outfile keeper-wallet.json
```

This creates a new keypair. The public key is your keeper wallet address.
Keep `keeper-wallet.json` safe — never commit it to git.

### Step 2 — Airdrop SOL on Devnet

```bash
solana airdrop 2 $(solana-keygen pubkey keeper-wallet.json) --url devnet
```

The keeper earns vault account rent (~0.002 SOL) back on every successful claim,
so 2 SOL will last a very long time.

### Step 3 — Set the Environment Variable

```bash
export KEEPER_KEYPAIR="$(cat keeper-wallet.json)"
export RPC_URL="https://api.devnet.solana.com"   # optional, this is the default
```

> On Windows PowerShell:
> ```powershell
> $env:KEEPER_KEYPAIR = Get-Content keeper-wallet.json -Raw
> ```

### Step 4 — Run the Bot

```bash
# From the project root (proof_pol/)
ts-node keeper/keeper.ts
```

---

## Expected Output

```
╔══════════════════════════════════════════════╗
║     Proof-of-Life Keeper Bot  (DEVNET)       ║
╚══════════════════════════════════════════════╝
Keeper wallet : 7abc...xyz
RPC           : https://api.devnet.solana.com
Program       : DHHHbFF...
Poll interval : every 2 days
Grace period  : 48h after deadline
Wallet balance: 2.000000 SOL

────────────────────────────────────────────────────────────
[2026-01-01T12:00:00.000Z]  Scanning for claimable vaults...
Found 5 total vault(s) | 5 active
  WAITING   AbCd12...  →  claimable in 22h 15m
  WAITING   EfGh34...  →  claimable in 3h 45m
  CLAIMING  IjKl56...  →  expired at 2025-12-30T...  nominee=9xYz...
  ✓ SUCCESS  sig=4abc1234xyz...  funds sent to 9xYz...
  WAITING   MnOp78...  →  claimable in 47h 0m

Scan complete.  Claimed: 1  |  Waiting: 4  |  Failed: 0
Next scan at: 2026-01-03T12:00:00.000Z
```

---

## Keep It Running 24/7

### Option A — pm2 (recommended for local machine)

```bash
npm install -g pm2
KEEPER_KEYPAIR="$(cat keeper-wallet.json)" pm2 start keeper/keeper.ts \
  --interpreter ts-node \
  --name proof-pol-keeper

pm2 logs proof-pol-keeper   # view logs
pm2 save                     # auto-restart on reboot
```

### Option B — nohup (simple background process)

```bash
export KEEPER_KEYPAIR="$(cat keeper-wallet.json)"
nohup ts-node keeper/keeper.ts > keeper.log 2>&1 &
echo "Keeper running with PID $!"
```

### Option C — GitHub Actions (free, no server needed)

Create `.github/workflows/keeper.yml`:
```yaml
name: Keeper Bot
on:
  schedule:
    - cron: '0 */12 * * *'   # every 12 hours
  workflow_dispatch:           # allow manual trigger
jobs:
  keep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: '18' }
      - run: npm install
      - run: ts-node keeper/keeper.ts
        env:
          KEEPER_KEYPAIR: ${{ secrets.KEEPER_KEYPAIR }}
```

Store the full content of `keeper-wallet.json` as a GitHub secret named `KEEPER_KEYPAIR`.

---

## Keeper Reward (Why It Costs Nothing)

| Action | SOL cost | SOL received |
|---|---|---|
| Transaction fee | ~0.000005 SOL | — |
| Create nominee ATA (if needed) | ~0.002 SOL | — |
| Vault account rent returned (`close = nominee`) | — | ~0.002 SOL |

The vault account rent returned covers the ATA creation cost exactly.
Net cost to the keeper: approximately **0 SOL per claim**.

---

## Switching to Mainnet

When ready for mainnet:
1. Change `RPC_URL` to a mainnet RPC
2. Build with `anchor build -- --features mainnet`
3. Deploy to mainnet
4. The bot code does not change — it reads `CLUSTER` from the on-chain program state

---

## Security

- The keeper wallet should hold ONLY enough SOL to operate (~0.1 SOL)
- Never store large amounts in the keeper wallet
- The keeper has ZERO ability to redirect funds — all transfers are enforced on-chain
- If the keeper bot is hacked, the attacker can only trigger valid claims (which would happen anyway)
- Multiple keeper bots can run simultaneously — first one to land wins, second gets `VaultInactive` error (harmless)
