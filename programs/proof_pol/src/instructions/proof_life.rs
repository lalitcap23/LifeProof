use anchor_lang::prelude::*;

use crate::constants::VAULT_SEED;
use crate::error::ErrorCode;
use crate::state::CommitmentVault;

#[derive(Accounts)]  
pub struct ProofOfLife<'info> {
    /// The vault owner - must sign to prove they are alive.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds  = [VAULT_SEED, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = owner @ ErrorCode::NotOwner,
    )]
    pub vault: Account<'info, CommitmentVault>,
}


/// The owner signs this transaction to prove they are alive.
/// Resets `last_checkin` to now, and recalculates the next deadline.
/// Reverts if:
///   * The vault is not active.
///   * The deadline has already passed (nominee can claim at that point).
pub fn handler(ctx: Context<ProofOfLife>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    require!(vault.is_active, ErrorCode::VaultInactive);

    let clock = Clock::get()?;
    let now   = clock.unix_timestamp;


    require!(!vault.deadline_passed(now), ErrorCode::DeadlineAlreadyPassed);

    // Roll the deadline forward
    let new_deadline = now
        .checked_add(vault.checkin_interval as i64)
        .ok_or(ErrorCode::Overflow)?;

    vault.last_checkin = now;
    vault.deadline     = new_deadline;

    msg!(
        "Proof-of-life accepted: owner={}, new_deadline={}",
        ctx.accounts.owner.key(),
        new_deadline,
    );

    Ok(())
}
        
       
    
