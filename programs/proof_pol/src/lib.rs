pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("aosGKFX4wB17YnkDjrCTyE4imXXadnwjxe2jsYWEY4e");

// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod proof_pol {
    use super::*;

    /// Create and fund a new commitment vault.
    ///
    /// # Arguments
    /// * `stake_lamports`   – SOL to lock (minimum 0.01 SOL).
    /// * `checkin_interval` – Seconds between required sign-ins (0 = 24 h default).
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        stake_lamports: u64,
        checkin_interval: u64,
    ) -> Result<()> {
        initialize_vault::handler(ctx, stake_lamports, checkin_interval)
    }

    /// Submit proof-of-life to reset the deadline.
    /// Must be called by the vault owner before the current deadline expires.
    pub fn proof_of_life(ctx: Context<ProofOfLife>) -> Result<()> {
        proof_life::handler(ctx)
    }

    /// Nominee claims the staked funds after a missed check-in deadline.
    pub fn claim_vault(ctx: Context<ClaimVault>) -> Result<()> {
        claim::handler(ctx)
    }

    /// Owner voluntarily closes the vault and reclaims their stake.
    /// Only valid while the deadline has not yet passed.
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        close::handler(ctx)
    }
}
