/// PDA seed for the vault account.
pub const VAULT_SEED: &[u8] = b"vault";

/// Minimum stake amount in raw token units.
/// For a token with 6 decimals this equals 10 tokens.
/// Prevents spam / dust vaults.
pub const MIN_STAKE_AMOUNT: u64 = 10_000_000;

/// Default check-in interval: 24 hours in seconds.
pub const DEFAULT_CHECKIN_INTERVAL: u64 = 86_400;

/// Maximum check-in interval allowed: 30 days in seconds.
/// Prevents indefinitely-locked vaults with no accountability.
pub const MAX_CHECKIN_INTERVAL: u64 = 86_400 * 30;

/// Minimum check-in interval allowed: 1 hour in seconds.
/// Prevents trivially short intervals that drain compute.
pub const MIN_CHECKIN_INTERVAL: u64 = 3_600;
