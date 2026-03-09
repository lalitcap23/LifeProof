use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::CommitmentVault;

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// The user who creates and controls this vault.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The accountability wallet.  Stored in vault state; does NOT need to sign here.
    /// CHECK: We validate nominee != owner in the handler; no further constraint needed.
    pub nominee: UncheckedAccount<'info>,

    /// PDA vault account.  Funded by `owner` via lamport transfer.
    #[account(
        init,
        payer  = owner,
        space  = 8 + CommitmentVault::INIT_SPACE,
        seeds  = [VAULT_SEED, owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, CommitmentVault>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/// Initialise a new commitment vault.
///
/// # Parameters
/// * `stake_lamports`    – Amount of SOL (in lamports) to lock in the vault.
/// * `checkin_interval`  – Seconds between required proof-of-life sign-ins.
///                         Pass `0` to use the default (24 hours).
pub fn handler(
    ctx: Context<InitializeVault>,
    stake_lamports: u64,
    checkin_interval: u64,
) -> Result<()> {
    let owner_key = ctx.accounts.owner.key();
    let nominee_key = ctx.accounts.nominee.key();

    // ── Validation ────────────────────────────────────────────────────────────

    require!(owner_key != nominee_key, ErrorCode::SelfNominee);
    require!(stake_lamports >= MIN_STAKE_LAMPORTS, ErrorCode::StakeTooLow);

    let interval = if checkin_interval == 0 {
        DEFAULT_CHECKIN_INTERVAL
    } else {
        checkin_interval
    };

    require!(interval >= MIN_CHECKIN_INTERVAL, ErrorCode::IntervalTooShort);
    require!(interval <= MAX_CHECKIN_INTERVAL, ErrorCode::IntervalTooLong);

    // ── Transfer stake into the vault PDA ────────────────────────────────────

    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to:   ctx.accounts.vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, stake_lamports)?;

    // ── Record state ─────────────────────────────────────────────────────────

    let clock = Clock::get()?;
    let now   = clock.unix_timestamp;

    let deadline = now
        .checked_add(interval as i64)
        .ok_or(ErrorCode::Overflow)?;

    let vault        = &mut ctx.accounts.vault;
    vault.owner           = owner_key;
    vault.nominee         = nominee_key;
    vault.stake_amount    = stake_lamports;
    vault.checkin_interval= interval;
    vault.last_checkin    = now;
    vault.deadline        = deadline;
    vault.is_active       = true;
    vault.bump            = ctx.bumps.vault;

    msg!(
        "Vault initialized: owner={}, nominee={}, stake={} lamports, interval={}s, deadline={}",
        owner_key,
        nominee_key,
        stake_lamports,
        interval,
        deadline,
    );

    Ok(())
}
