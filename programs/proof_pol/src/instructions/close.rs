use anchor_lang::prelude::*;

use crate::constants::VAULT_SEED;
use crate::error::ErrorCode;
use crate::state::CommitmentVault;


#[derive(Accounts)]
pub struct CloseVault<'info> {
    /// The vault owner reclaims their stake.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The vault PDA.  Closed after call; lamports returned to `owner`.
    #[account(
        mut,
        seeds  = [VAULT_SEED, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = owner @ ErrorCode::NotOwner,
        close  = owner,                            // stake + rent returned to owner
    )]
    pub vault: Account<'info, CommitmentVault>,

    pub system_program: Program<'info, System>,
}


/// The owner voluntarily closes the vault and retrieves their staked SOL.
///
/// The owner may only close the vault while the deadline has NOT yet passed —
/// i.e. while they are still "in good standing".  Once the deadline lapses the
/// vault is claimable by the nominee and the owner loses close authority.
///
/// Reverts if:
///   * The vault is not active.
///   * The deadline has already passed (nominee's claim window is open).
pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    let vault = &ctx.accounts.vault;

    require!(vault.is_active, ErrorCode::VaultInactive);

    let clock = Clock::get()?;
    let now   = clock.unix_timestamp;

    // If the deadline has passed the owner can no longer self-close; the
    // nominee must claim.
    require!(!vault.deadline_passed(now), ErrorCode::DeadlineAlreadyPassed);

    msg!(
        "Vault closed voluntarily: owner={} reclaimed {} lamports",
        ctx.accounts.owner.key(),
        vault.stake_amount,
    );

    Ok(())
}
