pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("aosGKFX4wB17YnkDjrCTyE4imXXadnwjxe2jsYWEY4e");

#[program]
pub mod proof_pol {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_vault::handler(ctx)
    }
}
