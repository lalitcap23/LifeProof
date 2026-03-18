# LifeProof

//  Commitment Staking Protocol — "Proof of Life"
//
//  Architecture
//  ────────────
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │                        CommitmentVault (PDA)                        │
//  │  seeds: ["vault", owner_pubkey]                                     │
//  │                                                                     │
//  │  owner            Pubkey   ← committer wallet                       │
//  │  nominee          Pubkey   ← accountability wallet                  │
//  │  stake_amount     u64      ← lamports locked                        │
//  │  checkin_interval u64      ← seconds between required check-ins     │
//  │  last_checkin     i64      ← Unix ts of last proof-of-life tx       │
//  │  deadline         i64      ← Unix ts after which nominee may claim  │
//  │  is_active        bool                                              │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  Instructions
//  ────────────
//  initialize_vault(stake, interval)
//    Owner stakes SOL and sets a nominee + check-in cadence.
//    deadline = now + interval
//
//  proof_of_life()
//    Owner signs a tx before the deadline → rolls deadline forward.
//    Rejected after the deadline → nominee may now claim.
//
//  claim_vault()
//    Nominee claims forfeited stake once deadline has passed.
//    Vault PDA is closed; all lamports flow to nominee.
//
//  close_vault()
//    Owner voluntarily exits while still in good standing.
//    Vault PDA is closed; all lamports returned to owner.
