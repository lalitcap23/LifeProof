use anchor_lang::prelude::*;

/// The on-chain state account for a single commitment vault.
///
/// Seeds: [b"vault", owner.key().as_ref()]
///
/// Layout (approximate byte budget):
///   discriminator  8
///   owner         32
///   nominee       32
///   stake_amount   8  (lamports, informational – actual lamports live in the account)
///   checkin_interval 8  (seconds between required check-ins)
///   last_checkin    8  (Unix timestamp of last proof-of-life tx)
///   deadline        8  (Unix timestamp after which nominee can claim)
///   is_active       1  (vault is live; false after close or claim)
///   bump            1
///   _padding        6
/// Total ≈ 112 bytes (rounded up via INIT_SPACE)
#[account]
#[derive(InitSpace)]
pub struct CommitmentVault {
    /// The wallet that created this vault (the "committer").
    pub owner: Pubkey,

    /// The wallet that can claim funds if the deadline is missed.
    pub nominee: Pubkey,

    /// Lamports locked at initialization (informational snapshot).
    pub stake_amount: u64,

    /// How often (in seconds) the owner must check in.
    /// e.g. 86_400 = once every 24 hours.
    pub checkin_interval: u64,

    /// Unix timestamp of the most recent successful proof-of-life.
    pub last_checkin: i64,

    /// Unix timestamp after which the nominee may claim.
    /// Recalculated as `last_checkin + checkin_interval` on every proof-of-life.
    pub deadline: i64,

    /// True while the vault is operational.
    pub is_active: bool,

    /// PDA bump seed for the vault account.
    pub bump: u8,
}

impl CommitmentVault {
    /// Convenience: check whether the deadline has passed relative to `now`.
    pub fn deadline_passed(&self, now: i64) -> bool {
        now > self.deadline
    }
}
