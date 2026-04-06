use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{CommitmentVault, OwnerProfile};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: validated against owner in the handle (SelfNominee guard).
    pub nominee: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + OwnerProfile::INIT_SPACE,
        seeds = [OWNER_PROFILE_SEED, owner.key().as_ref()],
        bump,
        constraint = owner_profile.owner == Pubkey::default() || owner_profile.owner == owner.key() @ ErrorCode::NotOwner,
    )]
    pub owner_profile: Account<'info, OwnerProfile>,

    /// PDA vault state account — created and rent-funded by `owner`.
    #[account(
        init,
        payer  = owner,
        space  = 8 + CommitmentVault::INIT_SPACE,
        seeds  = [VAULT_SEED, owner.key().as_ref(), &owner_profile.next_vault_id.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, CommitmentVault>,

    /// Any valid SPL mint is accepted
    pub mint: Account<'info, Mint>,
    /// Anchor validates: correct mint + correct owner authority.
    #[account(
        mut,
        associated_token::mint      = mint,
        associated_token::authority = owner,
    )]
    pub owner_ata: Account<'info, TokenAccount>,

    /// Vault's Associated Token Account — holds staked tokens for the vault's lifetime.
    /// The vault PDA is the sole authority, so only the program can move tokens out.
    /// `init` (not `init_if_needed`) because the vault PDA is always brand-new here.
    #[account(
        init,
        payer                       = owner,
        associated_token::mint      = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>, 

    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = owner,
    )]
    pub owner_usdc_ata: Account<'info, TokenAccount>,
    
    /// CHECK: it is  the hardcode plateform wallet address
    #[account(address = PLATFORM_WALLET)]
    pub platform_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = platform_wallet,
    )]
    pub platform_usdc_ata: Account<'info, TokenAccount>,

    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}


/// * `stake_amount`     – Raw SPL token units to lock (minimum `MIN_STAKE_AMOUNT`).
/// * `checkin_interval` – Seconds between required proof-of-life sign-ins.
///                        Pass `0` to use the 24-hour default.
pub fn handler(
    ctx: Context<InitializeVault>,
    stake_amount: u64,
    checkin_interval: u64,
) -> Result<()> {
    let owner_key   = ctx.accounts.owner.key();
    let nominee_key = ctx.accounts.nominee.key();
    let owner_profile = &mut ctx.accounts.owner_profile;

    if owner_profile.owner == Pubkey::default() {
        owner_profile.owner = owner_key;
        owner_profile.bump = ctx.bumps.owner_profile;
    }

    let vault_id = owner_profile.next_vault_id;

    require!(owner_key != nominee_key,         ErrorCode::SelfNominee);
    require!(stake_amount >= MIN_STAKE_AMOUNT, ErrorCode::StakeTooLow);

    let interval = if checkin_interval == 0 {
        DEFAULT_CHECKIN_INTERVAL
    } else {
        checkin_interval
    };

    require!(interval >= MIN_CHECKIN_INTERVAL, ErrorCode::IntervalTooShort);
    require!(interval <= MAX_CHECKIN_INTERVAL, ErrorCode::IntervalTooLong);
    // Transfer the 1 USDC platform fee
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.owner_usdc_ata.to_account_info(),
                to:        ctx.accounts.platform_usdc_ata.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        PLATFORM_FEE_USDC,
    )?;

    //  Transfer the staked tokens to the vault
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.owner_ata.to_account_info(),
                to:        ctx.accounts.vault_ata.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        stake_amount,
    )?;

    let clock    = Clock::get()?;
    let now      = clock.unix_timestamp;
    let deadline = now
        .checked_add(interval as i64)
        .ok_or(ErrorCode::Overflow)?;

    let vault              = &mut ctx.accounts.vault;
    vault.owner            = owner_key;
    vault.vault_id         = vault_id;
    vault.nominee          = nominee_key;
    vault.mint             = ctx.accounts.mint.key();
    vault.stake_amount     = stake_amount;
    vault.checkin_interval = interval;
    vault.last_checkin     = now;
    vault.deadline         = deadline;
    vault.is_active        = true;
    vault.bump             = ctx.bumps.vault;

    owner_profile.next_vault_id = owner_profile
        .next_vault_id
        .checked_add(1)
        .ok_or(ErrorCode::Overflow)?;

    msg!(
        "Vault initialized: owner={}, vault_id={}, nominee={}, mint={}, stake={} tokens, interval={}s, deadline={}",
        owner_key,
        vault_id,
        nominee_key,
        ctx.accounts.mint.key(),
        stake_amount,
        interval,
        deadline,
    );

    Ok(())
}
