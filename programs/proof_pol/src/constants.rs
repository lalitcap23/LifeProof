use anchor_lang::prelude::*;

/// PDA seed for the vault account.
pub const VAULT_SEED: &[u8] = b"vault";

/// Minimum stake amount in raw token units.
/// For a token with 6 decimals this equals 10 tokens.
pub const MIN_STAKE_AMOUNT: u64 = 10_000_000;

/// Default check-in interval: 24 hours in seconds.
pub const DEFAULT_CHECKIN_INTERVAL: u64 = 86_400;

/// Maximum check-in interval allowed: 30 days in seconds.
pub const MAX_CHECKIN_INTERVAL: u64 = 86_400 * 30;

/// Minimum check-in interval allowed: 1 hour in seconds.
pub const MIN_CHECKIN_INTERVAL: u64 = 3_600;

/// Extra waiting period after a missed deadline before claim is allowed.
/// 2 days in seconds.
pub const CLAIM_GRACE_PERIOD: u64 = 172_800;

pub const PLATFORM_WALLET: Pubkey = pubkey!("99xMByFHuyHspBCeygNAMya9jixwb2RsMsM4AQKefn2q");

pub const PLATFORM_FEE_USDC: u64 = 1_000_000;
