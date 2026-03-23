use anchor_lang::prelude::*;

/// Layout (approximate byte budget):
///   discriminator    8
///   owner           32
///   nominee         32
///   mint            32  ← SPL token mint being staked
///   stake_amount     8  (raw token units – informational snapshot)
///   checkin_interval 8  (seconds between required check-ins)
///   last_checkin     8  (Unix timestamp of last proof-of-life tx)
///   deadline         8  (Unix timestamp after which nominee can claim)
///   is_active        1  (vault is live; false after close or claim)
///   bump             1
///   _padding         6
/// Total ≈ 144 bytes (auto-calculated via INIT_SPACE)
#[account]
#[derive(InitSpace)]
pub struct CommitmentVault {
    pub owner: Pubkey,

    pub nominee: Pubkey,

    /// Used to validate the correct token accounts are passed on claim/close.
    pub mint: Pubkey,

    /// Actual tokens live in the vault's Associated Token Account (ATA).
    pub stake_amount: u64,

    pub checkin_interval: u64,

    pub last_checkin: i64,

    /// Unix timestamp after which the nominee may claim.
    /// Recalculated as `last_checkin + checkin_interval` on every proof-of-life.
    pub deadline: i64,

    pub is_active: bool,

    pub bump: u8,
}

impl CommitmentVault {
    pub fn deadline_passed(&self, now: i64) -> bool {
        now > self.deadline
    }
}
