use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{close_account, transfer, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::constants::VAULT_SEED;
use crate::error::ErrorCode;
use crate::state::CommitmentVault;

#[cfg(feature = "mainnet")]
use crate::kamino_cpi::{redeem_reserve_collateral, RedeemReserveCollateralAccounts};


#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds   = [VAULT_SEED, owner.key().as_ref(), &vault.vault_id.to_le_bytes()],
        bump    = vault.bump,
        has_one = owner @ ErrorCode::NotOwner,
        has_one = mint,
        close   = owner,
    )]
    pub vault: Box<Account<'info, CommitmentVault>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer                       = owner,
        associated_token::mint      = mint,
        associated_token::authority = owner,
    )]
    pub owner_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint      = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Box<Account<'info, TokenAccount>>,

    // Kamino redemption accounts (present always; used only on mainnet)
    #[account(
        mut,
        associated_token::mint      = k_token_mint,
        associated_token::authority = vault,
    )]
    pub vault_k_token_ata: Box<Account<'info, TokenAccount>>,

    pub k_token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Kamino reserve.
    pub kamino_reserve: UncheckedAccount<'info>,

    /// CHECK: Kamino lending market.
    pub kamino_lending_market: UncheckedAccount<'info>,

    /// CHECK: Kamino lending market authority PDA.
    pub kamino_lending_market_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub kamino_liquidity_supply: Box<Account<'info, TokenAccount>>,

    /// CHECK: Kamino lending program.
    pub kamino_lending_program: UncheckedAccount<'info>,

    /// CHECK: Instructions sysvar.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}


pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    require!(ctx.accounts.vault.is_active, ErrorCode::VaultInactive);

    let now = Clock::get()?.unix_timestamp;
    require!(
        !ctx.accounts.vault.deadline_passed(now),
        ErrorCode::DeadlineAlreadyPassed,
    );

    //  Build vault PDA signer seeds
    let bump_bytes     = [ctx.accounts.vault.bump];
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let owner_key      = ctx.accounts.owner.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, owner_key.as_ref(), &vault_id_bytes, &bump_bytes];
    let signer_seeds = &[vault_seeds];

    // [MAINNET ONLY] Redeem kTokens → tokens land in vault_ata.
    #[cfg(feature = "mainnet")]
    if ctx.accounts.vault.yield_deposited {
        let k_amount = ctx.accounts.vault_k_token_ata.amount;
        require!(k_amount > 0, ErrorCode::VaultEmpty);

        redeem_reserve_collateral(
            RedeemReserveCollateralAccounts {
                owner:                      ctx.accounts.vault.to_account_info(),
                lending_market:             ctx.accounts.kamino_lending_market.to_account_info(),
                reserve:                    ctx.accounts.kamino_reserve.to_account_info(),
                lending_market_authority:   ctx.accounts.kamino_lending_market_authority.to_account_info(),
                reserve_liquidity_mint:     ctx.accounts.mint.to_account_info(),
                reserve_collateral_mint:    ctx.accounts.k_token_mint.to_account_info(),
                reserve_liquidity_supply:   ctx.accounts.kamino_liquidity_supply.to_account_info(),
                user_source_collateral:     ctx.accounts.vault_k_token_ata.to_account_info(),
                user_destination_liquidity: ctx.accounts.vault_ata.to_account_info(),
                collateral_token_program:   ctx.accounts.token_program.to_account_info(),
                liquidity_token_program:    ctx.accounts.token_program.to_account_info(),
                instruction_sysvar:         ctx.accounts.instruction_sysvar.to_account_info(),
                kamino_program:             ctx.accounts.kamino_lending_program.to_account_info(),
            },
            k_amount,
            signer_seeds,
        )?;

        ctx.accounts.vault_ata.reload()?;
        msg!(
            "Kamino redemption (close): {} kTokens → {} tokens",
            k_amount, ctx.accounts.vault_ata.amount,
        );
    }

    let token_amount = ctx.accounts.vault_ata.amount;

    // Transfer: vault_ata → owner_ata
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.vault_ata.to_account_info(),
                to:        ctx.accounts.owner_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        token_amount,
    )?;

    // Close vault_ata; rent → owner
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account:     ctx.accounts.vault_ata.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority:   ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    ))?;

    msg!(
        "close_vault: owner={} reclaimed {} tokens | mint={}",
        ctx.accounts.owner.key(),
        token_amount,
        ctx.accounts.mint.key(),
    );

    Ok(())
}
