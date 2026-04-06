use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct OwnerProfile {
    pub owner: Pubkey,
    pub next_vault_id: u64,
    pub bump: u8,
}
