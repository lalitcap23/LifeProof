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
    #[account(mut)]
    pub nominee: Signer<'info>,

    /// The original vault owner — used only for PDA seed derivation.
    /// No signing required; ownership is verified by `has_one = owner` below,
    /// which checks vault.owner == owner.key() (belt-and-suspenders on top of seeds).
    ///
    /// LOOPHOLE-2 FIX: without `has_one = owner`, any pubkey could be passed
    /// as `owner` and, if seeds still resolve, bypass the stored-owner check.
    /// CHECK: address verified via seeds derivation AND `has_one = owner` on vault.
    pub owner: UncheckedAccount<'info>,

    /// The vault PDA state account.
    ///
    /// `seeds + bump`     — derives and verifies the PDA address.
    /// `has_one = owner`  — explicit check: vault.owner == owner.key()     [LOOPHOLE-2]
    /// `has_one = nominee`— rejects any signer that is not the stored nominee.
    /// `has_one = mint`   — ensures the correct token mint account is passed.
    /// `close   = nominee`— Anchor transfers vault-state rent to nominee
    ///automatically once the handler returns successfully.
    #[account(
        mut,
        seeds   = [VAULT_SEED, owner.key().as_ref()],
        bump    = vault.bump,
        has_one = owner   @ ErrorCode::NotOwner,
        has_one = nominee @ ErrorCode::NotNominee,
        has_one = mint,
        close   = nominee,
    )]
    pub vault: Account<'info, CommitmentVault>,

    /// The SPL token mint that was staked.
    /// Validated implicitly via `has_one = mint` on the vault above.
    pub mint: Account<'info, Mint>,

    /// Nominee's Associated Token Account — receives the staked tokens.
    ///
    /// LOOPHOLE-3 FIX: `init_if_needed` with explicit `associated_token::mint`
    /// and `associated_token::authority` constraints forces Anchor to validate
    /// the existing account's mint and owner fields even when the account
    /// already exists (i.e. it does NOT silently skip validation).
    /// A second layer of defence is applied in the handler itself via explicit
    /// runtime `require!` checks on nominee_ata.mint and nominee_ata.owner.
    #[account(
        init_if_needed,
        payer                       = nominee,
        associated_token::mint      = mint,
        associated_token::authority = nominee,
    )]
    pub nominee_ata: Account<'info, TokenAccount>,

    /// Vault's Associated Token Account — holds the staked tokens.
    ///
    /// LOOPHOLE-1 FIX: `associated_token::authority = vault` means the vault
    /// PDA is the SOLE authority over this ATA.  The nominee (or anyone else)
    /// cannot call `spl_token::transfer` or `spl_token::close_account` directly
    /// on this account — they would need the vault PDA to sign, which is only
    /// possible through this program.  Setting authority = nominee here would
    /// allow the nominee to bypass the deadline check entirely by calling the
    /// SPL Token program directly.
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

/// Nominee claims the staked tokens after the owner misses their check-in deadline.
///
/// Loopholes closed
///  1. vault_ata authority = vault PDA only — nominee cannot bypass this program
///     by calling SPL Token directly.
///  2. `has_one = owner` on vault — explicitly verifies vault.owner == owner.key()
///     on top of the seeds derivation, closing the UncheckedAccount ambiguity.
///  3. Runtime `require!` checks on nominee_ata.mint and nominee_ata.owner —
///     defence-in-depth on top of Anchor's ATA constraint validation.
///  4. `vault.is_active` is explicitly set to `false` before the handler returns,
///     ensuring the flag reflects reality even in edge cases where the account
///     close is somehow deferred.
///  5. `require!(vault_ata.amount > 0)` — rejects a claim on an already-empty
///     vault ATA so the nominee cannot grief the owner by closing a zero-balance
///     vault and claiming the rent without any tokens being present.
///
/// Execution steps
/// ───────────────
///   1. Guard: vault must be active.
///   2. Guard: current on-chain clock must be strictly past the stored deadline.
///   3. Guard: vault ATA must hold more than 0 tokens.           [LOOPHOLE-5]
///   4. Runtime ATA sanity checks on nominee_ata.                [LOOPHOLE-3]
///   5. Build vault PDA signer seeds.
///   6. CPI → SPL Token: transfer tokens vault ATA → nominee ATA (PDA signs).
///   7. CPI → SPL Token: close vault ATA; rent goes to nominee   (PDA signs).
///   8. Explicitly mark vault.is_active = false.                 [LOOPHOLE-4]
///   9. Anchor closes vault PDA state via `close = nominee` on handler exit.
pub fn handler(ctx: Context<ClaimVault>) -> Result<()> {
    // vault must be active ────────────────────────────────────────

    require!(ctx.accounts.vault.is_active, ErrorCode::VaultInactive);

    // deadline must have passed 
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.vault.deadline_passed(now),
        ErrorCode::DeadlineNotPassed
    );

    //  vault ATA must not be empty [LOOPHOLE-5] 
    //
    // Prevents a nominee from claiming a vault whose ATA was already drained
    // (e.g., due to a bug elsewhere) and only obtaining the rent lamports.

    require!(ctx.accounts.vault_ata.amount > 0, ErrorCode::VaultEmpty);

    //  runtime nominee ATA sanity checks [LOOPHOLE-3]
    //
    // Anchor's `associated_token::` constraints already validate these fields
    // at the account-loading stage.  These `require!` calls are a second,
    // explicit layer of defence-in-depth inside the handler itself, ensuring
    // that even if a constraint bug or future refactor weakens the struct-level
    // checks, the handler will still reject a mismatched ATA.

    require!(
        ctx.accounts.nominee_ata.mint == ctx.accounts.mint.key(),
        ErrorCode::NomineeAtaMintMismatch
    );
    require!(
        ctx.accounts.nominee_ata.owner == ctx.accounts.nominee.key(),
        ErrorCode::NomineeAtaOwnerMismatch
    );

    // build vault PDA signer seeds
    //
    // Seeds: [b"vault", owner_pubkey_bytes, bump_byte]
    // Both `bump_bytes` and `owner_key` are named stack locals so their
    // lifetimes outlive the `vault_seeds` slice — avoids the
    // "temporary value dropped while borrowed" compile error.

    let bump_bytes = [ctx.accounts.vault.bump];
    let owner_key = ctx.accounts.owner.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, owner_key.as_ref(), &bump_bytes];
    let signer = &[vault_seeds];

    // Snapshot the balance before any CPI can modify the ATA.
    let token_amount = ctx.accounts.vault_ata.amount;

    //CPI: transfer tokens vault ATA → nominee ATA
    //
    // The vault PDA is the authority on vault_ata (LOOPHOLE-1).
    // `CpiContext::new_with_signer` supplies the PDA seeds so the runtime
    // accepts the PDA as a valid signer for this call.
    // The nominee wallet has NO direct authority over vault_ata at any point.

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

    // CPI: close vault ATA; rent → nominee
    //
    // The vault ATA now holds 0 tokens.  `close_account` zeroes the account
    // and sends its rent-exempt reserve to the nominee.
    // The vault PDA must sign here too because it is still the ATA's authority.

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault_ata.to_account_info(),
            destination: ctx.accounts.nominee.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer,
    ))?;

    //  explicitly mark vault inactive [LOOPHOLE-4]
    //
    // Anchor's `close = nominee` constraint will zero the account data on exit,
    // but we set is_active = false explicitly here so that the flag accurately
    // reflects state for the remainder of this stack frame and for any off-chain
    // tools that may snapshot account data mid-instruction.
    // This is set AFTER all CPIs so that the vault AccountInfo is no longer
    // needed as a CPI authority — avoiding any borrow conflicts.

    ctx.accounts.vault.is_active = false;

    msg!(
        "claim_vault: nominee={} claimed {} token units | mint={} | owner={} | deadline was {}",
        ctx.accounts.nominee.key(),
        token_amount,
        ctx.accounts.mint.key(),
        ctx.accounts.owner.key(),
        ctx.accounts.vault.deadline,
    );

    //  vault PDA state closed by Anchor
    // The `close = nominee` constraint transfers all remaining lamports from
    // the vault PDA state account to the nominee and zeroes the account data
    // automatically when this handler returns Ok(()).

    Ok(())
}
