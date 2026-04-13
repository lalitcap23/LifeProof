/// Raw Kamino Lending CPI helpers.

/// We call Kamino via raw Solana instructions (not a typed CPI crate) to avoid
/// the `solana-program` version conflict between Anchor 0.32 and Kamino's older deps.
/// Instruction discriminators are the first 8 bytes of the Anchor-generated
/// instruction data, derived as `sha256("global:<instruction_name>")[..8]`.
/// These values are stable and versioned in the Kamino program IDL.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};

/// `deposit_reserve_liquidity` discriminator.
const DEPOSIT_RESERVE_LIQUIDITY_IX: [u8; 8] = [0xb7, 0x1b, 0x34, 0x38, 0xdd, 0x3d, 0x1c, 0x4d];

/// `redeem_reserve_collateral` discriminator.
const REDEEM_RESERVE_COLLATERAL_IX: [u8; 8] = [0x8b, 0x37, 0xc8, 0xe0, 0xb1, 0x43, 0x14, 0xb0];

/// `refresh_reserve` discriminator.
pub const REFRESH_RESERVE_IX: [u8; 8] = [0x02, 0x8c, 0x9a, 0x07, 0x1f, 0x6a, 0x63, 0xa2];

// deposit_reserve_liquidity

/// Accounts required for `deposit_reserve_liquidity`.
pub struct DepositReserveLiquidityAccounts<'info> {
    /// Vault PDA — the "owner" / signer in Kamino's context.
    pub owner:                       AccountInfo<'info>,
    pub reserve:                     AccountInfo<'info>,
    pub lending_market:              AccountInfo<'info>,
    pub lending_market_authority:    AccountInfo<'info>,
    pub reserve_liquidity_mint:      AccountInfo<'info>,
    pub reserve_liquidity_supply:    AccountInfo<'info>,
    pub reserve_collateral_mint:     AccountInfo<'info>,
    /// Source: vault's token ATA (holds the tokens to deposit).
    pub user_source_liquidity:       AccountInfo<'info>,
    /// Destination: vault's kToken ATA (receives receipt tokens).
    pub user_destination_collateral: AccountInfo<'info>,
    pub collateral_token_program:    AccountInfo<'info>,
    pub liquidity_token_program:     AccountInfo<'info>,
    pub instruction_sysvar:          AccountInfo<'info>,
    pub kamino_program:              AccountInfo<'info>,
}

/// CPI into Kamino `deposit_reserve_liquidity`.
/// The vault PDA must sign — pass its seeds via `signer_seeds`.
pub fn deposit_reserve_liquidity<'info>(
    accs: DepositReserveLiquidityAccounts<'info>,
    liquidity_amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    // Build instruction data: discriminator ++ u64 (little-endian amount).
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&DEPOSIT_RESERVE_LIQUIDITY_IX);
    data.extend_from_slice(&liquidity_amount.to_le_bytes());

    let account_metas = vec![
        AccountMeta::new_readonly(accs.owner.key(),               true),
        AccountMeta::new(accs.reserve.key(),                      true),
        AccountMeta::new_readonly(accs.lending_market.key(),      false),
        AccountMeta::new_readonly(accs.lending_market_authority.key(), false),
        AccountMeta::new_readonly(accs.reserve_liquidity_mint.key(), false),
        AccountMeta::new(accs.reserve_liquidity_supply.key(),     true),
        AccountMeta::new(accs.reserve_collateral_mint.key(),      true),
        AccountMeta::new(accs.user_source_liquidity.key(),        true),
        AccountMeta::new(accs.user_destination_collateral.key(),  true),
        AccountMeta::new_readonly(accs.collateral_token_program.key(), false),
        AccountMeta::new_readonly(accs.liquidity_token_program.key(), false),
        AccountMeta::new_readonly(accs.instruction_sysvar.key(),  false),
    ];

    let ix = Instruction {
        program_id: accs.kamino_program.key(),
        accounts:   account_metas,
        data,
    };

    let account_infos = [
        accs.owner,
        accs.reserve,
        accs.lending_market,
        accs.lending_market_authority,
        accs.reserve_liquidity_mint,
        accs.reserve_liquidity_supply,
        accs.reserve_collateral_mint,
        accs.user_source_liquidity,
        accs.user_destination_collateral,
        accs.collateral_token_program,
        accs.liquidity_token_program,
        accs.instruction_sysvar,
        accs.kamino_program,
    ];

    invoke_signed(&ix, &account_infos, signer_seeds)?;
    Ok(())
}



/// Accounts required for `redeem_reserve_collateral`.
pub struct RedeemReserveCollateralAccounts<'info> {
    /// Vault PDA — the "owner" / signer.
    pub owner:                       AccountInfo<'info>,
    pub lending_market:              AccountInfo<'info>,
    pub reserve:                     AccountInfo<'info>,
    pub lending_market_authority:    AccountInfo<'info>,
    pub reserve_liquidity_mint:      AccountInfo<'info>,
    pub reserve_collateral_mint:     AccountInfo<'info>,
    pub reserve_liquidity_supply:    AccountInfo<'info>,
    /// Source: vault's kToken ATA (holds receipt tokens to burn).
    pub user_source_collateral:      AccountInfo<'info>,
    /// Destination: vault's token ATA (receives underlying tokens + yield).
    pub user_destination_liquidity:  AccountInfo<'info>,
    pub collateral_token_program:    AccountInfo<'info>,
    pub liquidity_token_program:     AccountInfo<'info>,
    pub instruction_sysvar:          AccountInfo<'info>,
    pub kamino_program:              AccountInfo<'info>,
}

/// CPI into Kamino `redeem_reserve_collateral`
/// Burns `collateral_amount` kTokens; Kamino sends underlying tokens + yield
/// to `user_destination_liquidity`.
pub fn redeem_reserve_collateral<'info>(
    accs: RedeemReserveCollateralAccounts<'info>,
    collateral_amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&REDEEM_RESERVE_COLLATERAL_IX);
    data.extend_from_slice(&collateral_amount.to_le_bytes());

    let account_metas = vec![
        AccountMeta::new_readonly(accs.owner.key(),              true),
        AccountMeta::new_readonly(accs.lending_market.key(),     false),
        AccountMeta::new(accs.reserve.key(),                     true),
        AccountMeta::new_readonly(accs.lending_market_authority.key(), false),
        AccountMeta::new_readonly(accs.reserve_liquidity_mint.key(), false),
        AccountMeta::new(accs.reserve_collateral_mint.key(),     true),
        AccountMeta::new(accs.reserve_liquidity_supply.key(),    true),
        AccountMeta::new(accs.user_source_collateral.key(),      true),
        AccountMeta::new(accs.user_destination_liquidity.key(),  true),
        AccountMeta::new_readonly(accs.collateral_token_program.key(), false),
        AccountMeta::new_readonly(accs.liquidity_token_program.key(), false),
        AccountMeta::new_readonly(accs.instruction_sysvar.key(), false),
    ];

    let ix = Instruction {
        program_id: accs.kamino_program.key(),
        accounts:   account_metas,
        data,
    };

    let account_infos = [
        accs.owner,
        accs.lending_market,
        accs.reserve,
        accs.lending_market_authority,
        accs.reserve_liquidity_mint,
        accs.reserve_collateral_mint,
        accs.reserve_liquidity_supply,
        accs.user_source_collateral,
        accs.user_destination_liquidity,
        accs.collateral_token_program,
        accs.liquidity_token_program,
        accs.instruction_sysvar,
        accs.kamino_program,
    ];

    invoke_signed(&ix, &account_infos, signer_seeds)?;
    Ok(())
}
