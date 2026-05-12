//  LiteSVM test: initialize_vault

use litesvm::LiteSVM;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_associated_token_account::get_associated_token_address;
use proof_pol;

/// Load the compiled .so into LiteSVM so it can actually execute.
/// Make sure you have run `anchor build` first.
fn load_program(svm: &mut LiteSVM) {
    svm.add_program_from_file(
        PROGRAM_ID,
        "../../target/deploy/proof_pol.so",
    )
    .expect("failed to load proof_pol.so — did you run `anchor build`?");
}


#[test]
fn test_initialize_vault_interval_too_short_fails() {
    let mut f = Fixture::new();
    // interval < MIN_CHECKIN_INTERVAL (1 h = 3600 s) → IntervalTooShort
    let tx = build_initialize_vault_tx(&f, 0, MIN_STAKE_AMOUNT, 3_599);
    let result = f.svm.send_transaction(tx);
    assert!(result.is_err(), "expected IntervalTooShort error");
    println!("✅ test_initialize_vault_interval_too_short_fails passed");
}

#[test]
fn test_initialize_vault_interval_too_long_fails() {
    let mut f = Fixture::new();
    // interval > MAX_CHECKIN_INTERVAL (30 days) → IntervalTooLong
    let too_long = 86_400 * 31;
    let tx = build_initialize_vault_tx(&f, 0, MIN_STAKE_AMOUNT, too_long);
    let result = f.svm.send_transaction(tx);
    assert!(result.is_err(), "expected IntervalTooLong error");
    println!("✅ test_initialize_vault_interval_too_long_fails passed");
}

#[test]
fn test_initialize_vault_second_vault_for_same_owner() {
    // Owner creates vault_id=0, then vault_id=1 — should both succeed and
    // profile.next_vault_id should end up at 2.
    let mut f = Fixture::new();

    // First vault
    let tx0 = build_initialize_vault_tx(&f, 0, MIN_STAKE_AMOUNT, DEFAULT_CHECKIN_INTERVAL);
    f.svm.send_transaction(tx0).expect("first vault failed");

    // Top up so the owner has tokens for the second vault too
    mint_to(&mut f.svm, &f.stake_mint, &f.owner_ata,      &f.owner, 10 * MIN_STAKE_AMOUNT);
    mint_to(&mut f.svm, &f.usdc_mint,  &f.owner_usdc_ata, &f.owner, 10 * PLATFORM_FEE_USDC);

    // Second vault
    let tx1 = build_initialize_vault_tx(&f, 1, MIN_STAKE_AMOUNT, DEFAULT_CHECKIN_INTERVAL);
    f.svm.send_transaction(tx1).expect("second vault failed");

    let (owner_profile_pda, _) = owner_profile_pda(&f.owner.pubkey());
    let profile_account = f.svm.get_account(&owner_profile_pda).unwrap();
    let profile: OwnerProfile =
        OwnerProfile::try_deserialize(&mut &profile_account.data[8..]).unwrap();

    assert_eq!(profile.next_vault_id, 2, "next_vault_id should be 2 after two vaults");
    println!("✅ test_initialize_vault_second_vault_for_same_owner passed");
}

//  tiny utility 

fn token_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    use spl_token::state::Account as SplAccount;
    use solana_sdk::program_pack::Pack;

    let account = svm.get_account(ata).unwrap_or_default();
    if account.data.len() < SplAccount::LEN {
        return 0;
    }
    SplAccount::unpack(&account.data).map(|a| a.amount).unwrap_or(0)
}
