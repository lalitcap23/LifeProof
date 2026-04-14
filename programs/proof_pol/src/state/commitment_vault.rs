use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CommitmentVault {
    pub owner: Pubkey,

    pub vault_id: u64,

    pub nominee: Pubkey,

    pub mint: Pubkey,

   
    pub stake_amount: u64,

    pub checkin_interval: u64,

    pub last_checkin: i64,

    pub deadline: i64,

    pub is_active: bool,

    /// True when tokens have been deposited into Kamino (mainnet only).
    /// False on devnet — tokens remain in vault_ata.
    pub yield_deposited: bool,

    /// Kamino collateral (kToken) mint received after deposit.
    /// Pubkey::default() on devnet.
    pub k_token_mint: Pubkey,

    /// Number of kTokens held in the vault's kToken ATA.
    /// 0 on devnet.
    pub k_token_amount: u64,

    pub bump: u8,
}

impl CommitmentVault {
    pub fn deadline_passed(&self, now: i64) -> bool {
        now > self.deadline
    }
}
