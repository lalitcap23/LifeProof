use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    /// Vault has already been initialized for this owner.
    #[msg("A commitment vault already exists for this owner.")]
    VaultAlreadyExists,

    /// Operation requires the vault to be active.
    #[msg("The commitment vault is no longer active.")]
    VaultInactive,

    /// The vault's token account holds no tokens — nothing to claim or close.
    #[msg("The vault token account is empty; no tokens to transfer.")]
    VaultEmpty,

    // Stake / amount validation
    /// Stake is below the minimum threshold.
    #[msg("Stake amount is below the minimum required (10_000_000 raw token units).")]
    StakeTooLow,

    // Interval validation
    /// Supplied check-in interval is shorter than the minimum allowed.
    #[msg("Check-in interval is too short (minimum: 1 hour).")]
    IntervalTooShort,

    /// Supplied check-in interval is longer than the maximum allowed.
    #[msg("Check-in interval is too long (maximum: 30 days).")]
    IntervalTooLong,

    // Deadline / liveness
    /// Nominee tried to claim but the deadline has NOT been missed yet.
    #[msg("The deadline has not passed; the owner is still in time.")]
    DeadlineNotPassed,

    /// Claim attempted after deadline but before the post-deadline grace period ends.
    #[msg("The claim grace period has not elapsed yet.")]
    ClaimGracePeriodNotPassed,

    /// Owner tried to submit proof-of-life after the deadline has already passed.
    #[msg("The deadline has already passed; proof-of-life is no longer accepted.")]
    DeadlineAlreadyPassed,

    // Authority checks
    /// Signer is not the vault's nominee.
    #[msg("Only the nominated accountability wallet may perform this action.")]
    NotNominee,

    /// Signer is not the vault's owner.
    #[msg("Only the vault owner may perform this action.")]
    NotOwner,

    /// Owner and nominee must be different wallets.
    #[msg("The owner and nominee cannot be the same wallet.")]
    SelfNominee,

    // Token account validation
    /// The nominee token account mint does not match the vault's stored mint.
    #[msg("Nominee token account mint does not match the vault mint.")]
    NomineeAtaMintMismatch,

    /// The nominee token account authority does not match the nominee wallet.
    #[msg("Nominee token account is not owned by the nominee wallet.")]
    NomineeAtaOwnerMismatch,

    // Arithmetic
    /// Integer overflow in deadline calculation.
    #[msg("Arithmetic overflow when computing deadline timestamp.")]
    Overflow,
}
