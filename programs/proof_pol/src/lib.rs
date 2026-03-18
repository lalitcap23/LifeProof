pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("aosGKFX4wB17YnkDjrCTyE4imXXadnwjxe2jsYWEY4e");


#[program]
pub mod proof_pol {
    use super::*;

    /// Create and fund a new commitment vault.
    ///
    /// # Arguments
    /// * `stake_amount`     – Raw SPL token units to lock (minimum MIN_STAKE_AMOUNT).
    /// * `checkin_interval` – Seconds between required sign-ins (0 = 24 h default).
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        stake_amount: u64,
        checkin_interval: u64,
    ) -> Result<()> {
        initialize_vault::handler(ctx, stake_amount, checkin_interval)
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
