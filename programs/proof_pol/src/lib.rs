pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

/// Raw Kamino lending CPI helpers (compiled only on mainnet builds)
#[cfg(feature = "mainnet")]
pub mod kamino_cpi;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("DHHHbFFGWX2y4HkgdePB61bUZxdJQw8VmfGvgR4cxeof");


#[program]
pub mod proof_pol {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_id: u64,
        stake_amount: u64,
        checkin_interval: u64,
    ) -> Result<()> {
        initialize_vault::handler(ctx, vault_id, stake_amount, checkin_interval)
    }

    pub fn proof_of_life(ctx: Context<ProofOfLife>) -> Result<()> {
        proof_life::handler(ctx)
    }

    /// Anyone may execute claim after a missed deadline + grace period.
    /// Funds are always transferred to the stored nominee.
    pub fn claim_vault(ctx: Context<ClaimVault>) -> Result<()> {
        claim::handler(ctx)
    }

    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        close::handler(ctx)
    }
}

