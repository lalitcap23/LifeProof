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
    /// The vault owner — signs the transaction and reclaims all tokens + rent.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The vault PDA state account.
    /// `has_one = owner`  — ensures only the real owner can close.
    /// `has_one = mint`   — ensures the correct token mint is passed.
    /// `close   = owner`  — Anchor transfers vault-account rent back to owner
    ///                      automatically once the handler returns.
    #[account(
        mut,
        seeds   = [VAULT_SEED, owner.key().as_ref()],
        bump    = vault.bump,
        has_one = owner @ ErrorCode::NotOwner,
        has_one = mint,
        close   = owner,
    )]
    pub vault: Account<'info, CommitmentVault>,

    /// The SPL token mint that was staked.
    /// Validated implicitly via `has_one = mint` on the vault above.
    pub mint: Account<'info, Mint>,

    /// Owner's Associated Token Account — receives the staked tokens back.
    /// `init_if_needed` handles the rare edge-case where the owner closed
    /// their ATA after the vault was initialized.
    #[account(
        init_if_needed,
        payer                       = owner,
        associated_token::mint      = mint,
        associated_token::authority = owner,
    )]
    pub owner_ata: Account<'info, TokenAccount>,

    /// Vault's Associated Token Account — holds the staked tokens.
    /// Anchor validates the address matches (vault PDA, mint).
    /// The vault PDA is the sole authority; only PDA-signed CPIs can move tokens.
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


/// Owner voluntarily closes the vault and retrieves their staked tokens.
/// Only valid while the deadline has NOT yet passed — i.e. while the owner is
/// still in good standing.  Once the deadline lapses the vault can only be
/// claimed by the nominee.
/// Steps executed:
///   1. Guard: vault must be active.
///   2. Guard: deadline must not have passed yet.
///   3. CPI → SPL Token: transfer all tokens from vault ATA → owner ATA
///              (vault PDA signs via stored bump seed).
///   4. CPI → SPL Token: close the now-empty vault ATA; rent goes to owner.
///   5. Anchor closes the vault PDA state account via `close = owner`
///              (happens automatically on handler exit).
/// Reverts if:
///   * The vault is not active.
///   * The deadline has already passed (nominee's claim window is open).
pub fn handler(ctx: Context<CloseVault>) -> Result<()> {

    require!(ctx.accounts.vault.is_active, ErrorCode::VaultInactive);

    let now = Clock::get()?.unix_timestamp;
    require!(
        !ctx.accounts.vault.deadline_passed(now),
        ErrorCode::DeadlineAlreadyPassed
    );

    // Build vault PDA signer seeds
    // Seeds must exactly match those used in `initialize_vault`:
    //   [b"vault", owner_pubkey_bytes, bump_byte]
    // We copy `bump` into a local byte array so its lifetime outlives the
    // `seeds` slice — avoids a "temporary value dropped while borrowed" error.

    let bump_bytes = [ctx.accounts.vault.bump];
    let owner_key = ctx.accounts.owner.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, owner_key.as_ref(), &bump_bytes];
    let signer = &[vault_seeds];

    // Snapshot the token balance before any CPI modifies the account.
    let token_amount = ctx.accounts.vault_ata.amount;

    // CPI 1 transfer tokens: vault ATA → owner ATA

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

    //  CPI 2 close vault ATA: rent-lamports returned to owner

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

    // Vault PDA state account is closed automatically by the
    // `close = owner` constraint once this handler returns.
    Ok(())
}

