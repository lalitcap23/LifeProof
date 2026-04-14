use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{CommitmentVault, OwnerProfile};

// Mainnet-only import of our raw Kamino CPI helper.
#[cfg(feature = "mainnet")]
use crate::kamino_cpi::{deposit_reserve_liquidity, DepositReserveLiquidityAccounts};


/// `vault_k_token_ata`.
#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: validated against owner in the handler (SelfNominee guard).
    pub nominee: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + OwnerProfile::INIT_SPACE,
        seeds = [OWNER_PROFILE_SEED, owner.key().as_ref()],
        bump,
        constraint = owner_profile.owner == Pubkey::default()
            || owner_profile.owner == owner.key() @ ErrorCode::NotOwner,
    )]
    pub owner_profile: Box<Account<'info, OwnerProfile>>,

    #[account(
        init,
        payer  = owner,
        space  = 8 + CommitmentVault::INIT_SPACE,
        seeds  = [VAULT_SEED, owner.key().as_ref(), &vault_id.to_le_bytes()],
        bump,
    )]
    pub vault: Box<Account<'info, CommitmentVault>>,

    pub mint: Box<Account<'info, Mint>>,

    /// Owner's token ATA tokens are pulled from here
    #[account(
        mut,
        associated_token::mint      = mint,
        associated_token::authority = owner,
    )]
    pub owner_ata: Box<Account<'info, TokenAccount>>,

    /// Vault's token ATA — holds tokens on devnet; used as staging on mainnet
    /// before the Kamino CPI moves them into the reserve.
    #[account(
        init,
        payer                       = owner,
        associated_token::mint      = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Box<Account<'info, TokenAccount>>,


    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = owner,
    )]
    pub owner_usdc_ata: Box<Account<'info, TokenAccount>>,

    /// CHECK: hardcoded platform wallet address.
    #[account(address = PLATFORM_WALLET)]
    pub platform_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = platform_wallet,
    )]
    pub platform_usdc_ata: Box<Account<'info, TokenAccount>>,

    // Kamino yield accounts — present on all builds, used only on mainnet.
    // On devnet: pass any valid accounts; they are never invoked.

    /// Vault's kToken ATA — receives Kamino receipt tokens on mainnet.
    /// Created here so the ATA exists. On devnet it stays empty
    #[account(
        init,
        payer                       = owner,
        associated_token::mint      = k_token_mint,
        associated_token::authority = vault,
    )]
    pub vault_k_token_ata: Box<Account<'info, TokenAccount>>,

    /// Kamino collateral/receipt token mint (kUSDC or kSOL on mainnet).
    /// On devnet: pass `mint` itself as a placeholder.
    pub k_token_mint: Box<Account<'info, Mint>>,

    /// Kamino reserve for the deposited token.
    /// CHECK: validated in handler on mainnet.
    pub kamino_reserve: UncheckedAccount<'info>,

    /// CHECK: Kamino lending market.
    pub kamino_lending_market: UncheckedAccount<'info>,

    /// CHECK: Kamino lending market authority PDA.
    pub kamino_lending_market_authority: UncheckedAccount<'info>,

    /// Kamino liquidity supply vault (receives the actual tokens).
    #[account(mut)]
    pub kamino_liquidity_supply: Box<Account<'info, TokenAccount>>,

    /// CHECK: Kamino lending program. On mainnet validated in handler.
    pub kamino_lending_program: UncheckedAccount<'info>,

    /// CHECK: Instructions sysvar required by Kamino.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}


pub fn handler(
    ctx: Context<InitializeVault>,
    vault_id: u64,
    stake_amount: u64,
    checkin_interval: u64,
) -> Result<()> {
    let owner_key     = ctx.accounts.owner.key();
    let nominee_key   = ctx.accounts.nominee.key();
    let owner_profile = &mut ctx.accounts.owner_profile;

    if owner_profile.owner == Pubkey::default() {
        owner_profile.owner = owner_key;
        owner_profile.bump  = ctx.bumps.owner_profile;
    }

    // Guards
    require!(owner_key != nominee_key,          ErrorCode::SelfNominee);
    require!(stake_amount >= MIN_STAKE_AMOUNT,  ErrorCode::StakeTooLow);
    require!(vault_id >= owner_profile.next_vault_id, ErrorCode::Overflow);

    let interval = if checkin_interval == 0 {
        DEFAULT_CHECKIN_INTERVAL
    } else {
        checkin_interval
    };
    require!(interval >= MIN_CHECKIN_INTERVAL, ErrorCode::IntervalTooShort);
    require!(interval <= MAX_CHECKIN_INTERVAL, ErrorCode::IntervalTooLong);

    //  Collect 1 USDC platform fee
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

    //  Transfer stake: owner ATA → vault ATA
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

    //  [MAINNET ONLY] Deposit vault tokens into Kamino; receive kTokens.
    //    Vault PDA signs the CPI as authority over vault_ata.
    //    On devnet this entire block is compiled away — tokens stay in vault_ata.
    let mut k_token_amount: u64 = 0;
    let _ = &mut k_token_amount; // suppresses unused_mut on devnet builds

    #[cfg(feature = "mainnet")]
    {
        // Validate Kamino program address.
        require_keys_eq!(
            ctx.accounts.kamino_lending_program.key(),
            KAMINO_LENDING_PROGRAM_ID,
            ErrorCode::InvalidKaminoProgram,
        );

        // Build vault PDA signer seeds.
        let bump_bytes     = [ctx.accounts.vault.bump];
        let vault_id_bytes = vault_id.to_le_bytes();
        let vault_seeds: &[&[u8]] = &[VAULT_SEED, owner_key.as_ref(), &vault_id_bytes, &bump_bytes];
        let signer_seeds = &[vault_seeds];

        deposit_reserve_liquidity(
            DepositReserveLiquidityAccounts {
                owner:                       ctx.accounts.vault.to_account_info(),
                reserve:                     ctx.accounts.kamino_reserve.to_account_info(),
                lending_market:              ctx.accounts.kamino_lending_market.to_account_info(),
                lending_market_authority:    ctx.accounts.kamino_lending_market_authority.to_account_info(),
                reserve_liquidity_mint:      ctx.accounts.mint.to_account_info(),
                reserve_liquidity_supply:    ctx.accounts.kamino_liquidity_supply.to_account_info(),
                reserve_collateral_mint:     ctx.accounts.k_token_mint.to_account_info(),
                user_source_liquidity:       ctx.accounts.vault_ata.to_account_info(),
                user_destination_collateral: ctx.accounts.vault_k_token_ata.to_account_info(),
                collateral_token_program:    ctx.accounts.token_program.to_account_info(),
                liquidity_token_program:     ctx.accounts.token_program.to_account_info(),
                instruction_sysvar:          ctx.accounts.instruction_sysvar.to_account_info(),
                kamino_program:              ctx.accounts.kamino_lending_program.to_account_info(),
            },
            stake_amount,
            signer_seeds,
        )?;

        ctx.accounts.vault_k_token_ata.reload()?;
        k_token_amount = ctx.accounts.vault_k_token_ata.amount;

        msg!(
            "Kamino deposit: {} tokens → {} kTokens minted",
            stake_amount, k_token_amount,
        );
    }

    let clock    = Clock::get()?;
    let now      = clock.unix_timestamp;
    let deadline = now
        .checked_add(interval as i64)
        .ok_or(ErrorCode::Overflow)?;

    let vault = &mut ctx.accounts.vault;
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
    vault.yield_deposited  = k_token_amount > 0;
    vault.k_token_mint     = ctx.accounts.k_token_mint.key();
    vault.k_token_amount   = k_token_amount;

    owner_profile.next_vault_id = vault_id
        .checked_add(1)
        .ok_or(ErrorCode::Overflow)?;

    msg!(
        "Vault initialized: owner={} vault_id={} nominee={} mint={} \
         stake={} interval={}s deadline={} yield_deposited={} k_tokens={}",
        owner_key, vault_id, nominee_key,
        ctx.accounts.mint.key(),
        stake_amount, interval, deadline,
        vault.yield_deposited, k_token_amount,
    );

    Ok(())
}
