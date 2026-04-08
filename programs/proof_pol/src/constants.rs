use anchor_lang::prelude::*;

/// PDA seed for the vault account.
pub const VAULT_SEED: &[u8] = b"vault";
pub const OWNER_PROFILE_SEED: &[u8] = b"owner_profile";

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

// ---------------------------------------------------------------------------
// Supported Stake Token Mints (Solana Mainnet)
// ---------------------------------------------------------------------------

/// Circle USDC — native Solana mint (6 decimals).
pub const MINT_USDC: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/// Tether USDT — native Solana mint (6 decimals).
pub const MINT_USDT: Pubkey = pubkey!("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");

/// Wormhole-bridged Ethereum (ETH) — 8 decimals.
pub const MINT_ETH: Pubkey = pubkey!("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs");

/// Wormhole-bridged Bitcoin (BTC) — 8 decimals.
pub const MINT_BTC: Pubkey = pubkey!("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh");

/// Wormhole-bridged Polygon (MATIC) — 8 decimals.
pub const MINT_MATIC: Pubkey = pubkey!("C7NNPWuZCNjZBfW5p6JvGsR8sjUKaq1Kj4gSRBGMonqc");

/// Wormhole-bridged Sui (SUI) — 8 decimals.
pub const MINT_SUI: Pubkey = pubkey!("6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN");

/// Wormhole-bridged BNB (Binance Coin) — 8 decimals.
pub const MINT_BNB: Pubkey = pubkey!("9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa");

/// Wormhole-bridged Avalanche (AVAX) — 8 decimals.
pub const MINT_AVAX: Pubkey = pubkey!("KgV1GvrHQmRBY8sHQQeUKwTm2r2h8t4C8qt12Cg1zGT");

/// Wormhole-bridged Arbitrum (ARB) — 8 decimals.
pub const MINT_ARB: Pubkey = pubkey!("HZ1JovNiVvGqxryxCqRrUouwYjvmKZAN9yhVdfQ3gyuA");

/// Wormhole-bridged Optimism (OP) — 8 decimals.
pub const MINT_OP: Pubkey = pubkey!("Fz6LxeUg5qjesYX3BdmtTwyyzBtMxk644XiTqU5W3w9W");

/// Chainlink Token (LINK) on Solana — 8 decimals.
pub const MINT_LINK: Pubkey = pubkey!("2wpTofQ8SkACrkZWrZDjXPitYa8AwWgX8AfxdeBRRVLX");

/// Full list of all whitelisted stake token mints.
/// Use this array to validate the mint passed into initialize_vault.
pub const ALLOWED_MINTS: [Pubkey; 12] = [
    MINT_WSOL,
    MINT_USDC,
    MINT_USDT,
    MINT_ETH,
    MINT_BTC,
    MINT_MATIC,
    MINT_SUI,
    MINT_BNB,
    MINT_AVAX,
    MINT_ARB,
    MINT_OP,
    MINT_LINK,
];
