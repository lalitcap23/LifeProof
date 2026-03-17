use anchor_lang::prelude::*;

use crate::constants::VAULT_SEED;
use crate::error::ErrorCode;
use crate::state::CommitmentVault;


#[derive(Accounts)]
pub struct ClaimVault<'info> {
    #[account(mut)]
    pub nominee: Signer<'info>,

    /// The original vault owner — needed to derive the PDA seeds.
    /// CHECK: We only use this for seed derivation; no authority check needed here.
    pub owner: UncheckedAccount<'info>,

    /// The vault PDA.  Closed after claim; lamports go to `nominee`.
    #[account(
        mut,
        seeds  = [VAULT_SEED, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = nominee @ ErrorCode::NotNominee,
        close  = nominee,                          // rent + stake flows to nominee
    )]
    pub vault: Account<'info, CommitmentVault>,

    pub system_program: Program<'info, System>,
}



/// The nominee calls this to claim the staked SOL after the deadline is missed.
///
/// Reverts if:
///   * The vault is not active.
///   * The deadline has NOT yet passed (owner is still in time).
/// On success the vault account is closed and all lamports (stake + rent) are
/// transferred to the nominee.
pub fn handler(ctx: Context<ClaimVault>) -> Result<()> {
    let vault = &ctx.accounts.vault;

    require!(vault.is_active, ErrorCode::VaultInactive);

    let clock = Clock::get()?;
    let now   = clock.unix_timestamp;

    require!(vault.deadline_passed(now), ErrorCode::DeadlineNotPassed);

    // The `close = nominee` constraint in the account struct handles the
    // lamport transfer automatically when the account is closed by Anchor.
    // We just emit a log here for client-side observability.
    msg!(
        "Claim accepted: nominee={} claimed {} lamports from vault of owner={} (deadline was {})",
        ctx.accounts.nominee.key(),
        vault.stake_amount,
        ctx.accounts.owner.key(),
        vault.deadline,
    );

    Ok(())
}
 