use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{close_account, transfer, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::constants::VAULT_SEED;
use crate::error::ErrorCode;
use crate::state::CommitmentVault;


#[derive(Accounts)]
pub struct CloseVault<'info> {
    /// The vault owner
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
    pub vault: Account<'info, CommitmentVault>,

    /// The SPL token mint that was staked.
    pub mint: Account<'info, Mint>,

    /// Owner's Associated Token Account — receives the staked tokens back.
    // init_if_need if the ownr deleted the ata 
    #[account(
        init_if_needed,
        payer                       = owner,
        associated_token::mint      = mint,
        associated_token::authority = owner,
    )]
    pub owner_ata: Account<'info, TokenAccount>,

    /// Vault's Associated Token Account — holds the staked tokens.
    #[account(
        mut,
        associated_token::mint      = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}


/// CPI: transfer vault tokens → owner; close ATA; PDA closes to owner.

pub fn handler(ctx: Context<CloseVault>) -> Result<()> {

    require!(ctx.accounts.vault.is_active, ErrorCode::VaultInactive);

    let now = Clock::get()?.unix_timestamp;
    require!(
        !ctx.accounts.vault.deadline_passed(now),
        ErrorCode::DeadlineAlreadyPassed
    );

    // Build vault PDA signer seeds
    // Seeds must exactly match those used in `initialize_vault`:
    //   [b"vault", owner_pubkey_bytes, vault_id_le_bytes, bump_byte]
    // We copy `bump` into a local byte array so its lifetime outlives the
    // `seeds` slice — avoids a "temporary value dropped while borrowed" error.

    let bump_bytes = [ctx.accounts.vault.bump];
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let owner_key = ctx.accounts.owner.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, owner_key.as_ref(), &vault_id_bytes, &bump_bytes];
    let signer = &[vault_seeds];

    // Snapshot the token balance before any CPI modifies the account.
    let token_amount = ctx.accounts.vault_ata.amount;

    // CPI  transfer tokens: vault ATA → owner ATA

    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.owner_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        token_amount,
    )?;

    //  CPI  close vault ATA: rent-lamports returned to owner

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault_ata.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer,
    ))?;

    msg!(
        "close_vault: owner={} reclaimed {} token units | mint={}",
        ctx.accounts.owner.key(),
        token_amount,
        ctx.accounts.mint.key(),
    );

    Ok(())
}
