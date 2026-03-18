use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{close_account, transfer, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::constants::VAULT_SEED;
use crate::error::ErrorCode;
use crate::state::CommitmentVault;


#[derive(Accounts)]
pub struct ClaimVault<'info> {
    /// The nominee who is claiming the forfeited stake.
    /// Must match the pubkey stored inside the vault.
    #[account(mut)]
    pub nominee: Signer<'info>,

    /// The original vault owner — used only for PDA seed derivation.
    /// No signing required; ownership is enforced by the seeds constraint.
    /// CHECK: only used as a seed component to derive the vault PDA.
    pub owner: UncheckedAccount<'info>,

    /// The vault PDA state account.
    ///
    /// `has_one = nominee` — rejects any signer that is not the stored nominee.
    /// `has_one = mint`    — ensures the correct token mint account is passed.
    /// `close   = nominee` — Anchor transfers vault-state rent to nominee
    ///                       automatically once the handler returns.
    #[account(
        mut,
        seeds   = [VAULT_SEED, owner.key().as_ref()],
        bump    = vault.bump,
        has_one = nominee @ ErrorCode::NotNominee,
        has_one = mint,
        close   = nominee,
    )]
    pub vault: Account<'info, CommitmentVault>,

    /// The SPL token mint that was staked.
    /// Validated implicitly via `has_one = mint` on the vault above.
    pub mint: Account<'info, Mint>,

    /// Nominee's Associated Token Account — receives the staked tokens.
    /// `init_if_needed` handles the common case where the nominee has never
    /// held this token before and therefore has no ATA yet.
    #[account(
        init_if_needed,
        payer                       = nominee,
        associated_token::mint      = mint,
        associated_token::authority = nominee,
    )]
    pub nominee_ata: Account<'info, TokenAccount>,

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

// ─── Handler ─────────────────────────────────────────────────────────────────

/// Nominee claims the staked tokens after the owner misses their check-in deadline.
///
/// Steps executed:
///   1. Guard: vault must still be marked active.
///   2. Guard: current on-chain clock must be past the stored deadline.
///   3. CPI → SPL Token: transfer all tokens from vault ATA → nominee ATA
///              (vault PDA signs via stored bump seed).
///   4. CPI → SPL Token: close the now-empty vault ATA; rent goes to nominee
///              (vault PDA signs via stored bump seed).
///   5. Anchor closes the vault PDA state account via `close = nominee`
///              constraint (vault-state rent also flows to nominee).
///
/// Reverts if:
///   * The vault is not active.
///   * The deadline has NOT yet passed (owner is still in time).
///   * The signer is not the stored nominee (`has_one = nominee`).
///   * The wrong mint account is passed (`has_one = mint`).
pub fn handler(ctx: Context<ClaimVault>) -> Result<()> {
    // ── Guards ────────────────────────────────────────────────────────────────

    require!(ctx.accounts.vault.is_active, ErrorCode::VaultInactive);

    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.vault.deadline_passed(now),
        ErrorCode::DeadlineNotPassed
    );

    // ── Build vault PDA signer seeds ─────────────────────────────────────────
    //
    // Seeds must exactly match those used at initialization:
    //   [b"vault", owner_pubkey_bytes, bump_byte]
    //
    // `bump_bytes` and `owner_key` are stored as named locals so their
    // lifetimes outlive the `vault_seeds` slice — avoids a
    // "temporary value dropped while borrowed" compile error.

    let bump_bytes = [ctx.accounts.vault.bump];
    let owner_key = ctx.accounts.owner.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, owner_key.as_ref(), &bump_bytes];
    let signer = &[vault_seeds];

    // Snapshot the token balance before any CPI modifies the account data.
    let token_amount = ctx.accounts.vault_ata.amount;

    // ── CPI 1 — transfer tokens: vault ATA → nominee ATA ─────────────────────
    //
    // The vault PDA (not the nominee!) is the authority on vault_ata.
    // We pass `signer` so the runtime accepts the PDA as a valid signer.

    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.nominee_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        token_amount,
    )?;

    // ── CPI 2 — close vault ATA: rent-lamports returned to nominee ────────────
    //
    // After the transfer the vault ATA holds 0 tokens.
    // `close_account` zeroes it out and sends its rent-exempt balance to nominee.
    // Again the vault PDA must sign because it is the ATA's authority.

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault_ata.to_account_info(),
            destination: ctx.accounts.nominee.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer,
    ))?;

    msg!(
        "claim_vault: nominee={} claimed {} token units | mint={} | owner={} | deadline was {}",
        ctx.accounts.nominee.key(),
        token_amount,
        ctx.accounts.mint.key(),
        ctx.accounts.owner.key(),
        ctx.accounts.vault.deadline,
    );

    // ── Step 5 — vault PDA state ──────────────────────────────────────────────
    // Closed automatically by the `close = nominee` constraint on the vault
    // account once this handler returns cleanly.

    Ok(())
}
