use anchor_spl::token::TokenAccount;
use program_test::*;
use solana_program_test::*;
use solana_sdk::{pubkey::Pubkey, signature::Keypair, signer::Signer, transport::TransportError};
use std::cell::RefCell;
use std::sync::Arc;
use voter_stake_registry::state::LockupKind;

mod program_test;

async fn get_lockup_data(
    solana: &SolanaCookie,
    voter: Pubkey,
    index: u8,
    time_offset: i64,
) -> (u64, u64, u64, u64, u64) {
    let now = solana.get_clock().await.unix_timestamp + time_offset;
    let voter = solana
        .get_account::<voter_stake_registry::state::Voter>(voter)
        .await;
    let d = voter.deposits[index as usize];
    let duration = d.lockup.periods_total().unwrap() * d.lockup.kind.period_secs();
    (
        // time since lockup start (saturating at "duration")
        (duration - d.lockup.seconds_left(now)) as u64,
        // duration of lockup
        duration,
        d.amount_initially_locked_native,
        d.amount_deposited_native,
        d.amount_unlocked(now),
    )
}

#[allow(unaligned_references)]
#[tokio::test]
async fn test_reset_lockup() -> Result<(), TransportError> {
    let context = TestContext::new().await;
    let addin = &context.addin;

    let payer = &context.users[0].key;
    let realm_authority = Keypair::new();
    let realm = context
        .governance
        .create_realm(
            "testrealm",
            realm_authority.pubkey(),
            &context.mints[0],
            &payer,
            &context.addin.program_id,
        )
        .await;

    let voter_authority = &context.users[1].key;
    let token_owner_record = realm
        .create_token_owner_record(voter_authority.pubkey(), &payer)
        .await;

    let registrar = addin
        .create_registrar(&realm, &realm_authority, payer)
        .await;
    let voting_mint = addin
        .configure_voting_mint(
            &registrar,
            &realm_authority,
            payer,
            0,
            &context.mints[0],
            0,
            1.0,
            0,            
            0.0,
            0,
            0,
            5 * 365 * 24 * 60 * 60,
            None,
            None,
        )
        .await;

    let voter = addin
        .create_voter(&registrar, &token_owner_record, &voter_authority, &payer)
        .await;

    let reference_account = context.users[1].token_accounts[0];
    let withdraw = |index: u8, amount: u64| {
        addin.withdraw(
            &registrar,
            &voter,
            &voting_mint,
            &voter_authority,
            reference_account,
            index,
            amount,
        )
    };
    let deposit = |index: u8, amount: u64| {
        addin.deposit(
            &registrar,
            &voter,
            &voting_mint,
            &voter_authority,
            reference_account,
            index,
            amount,
        )
    };
    let reset_lockup = |index: u8, periods: u32, kind: LockupKind| {
        addin.reset_lockup(&registrar, &voter, &voter_authority, index, kind, periods)
    };
    let time_offset = Arc::new(RefCell::new(0i64));
    let advance_time = |extra: u64| {
        *time_offset.borrow_mut() += extra as i64;
        addin.set_time_offset(&registrar, &realm_authority, *time_offset.borrow())
    };
    let lockup_status =
        |index: u8| get_lockup_data(&context.solana, voter.address, index, *time_offset.borrow());

    let day = 24 * 60 * 60;
    let hour = 60 * 60;

    // tests for cliff vesting
    addin
        .create_deposit_entry(
            &registrar,
            &voter,
            &voter_authority,
            &voting_mint,
            5,
            LockupKind::Cliff,
            None,
            3,
        )
        .await
        .unwrap();
    deposit(5, 80).await.unwrap();
    assert_eq!(lockup_status(5).await, (0, 3 * day, 80, 80, 0));
    reset_lockup(5, 2, LockupKind::None)
        .await
        .expect_err("decreasing strictness");    
    reset_lockup(5, 2, LockupKind::Cliff)
        .await
        .expect_err("can't relock for less periods");
    reset_lockup(5, 3, LockupKind::Cliff).await.unwrap(); // just resets start to current timestamp
    assert_eq!(lockup_status(5).await, (0, 3 * day, 80, 80, 0));
    reset_lockup(5, 4, LockupKind::Cliff).await.unwrap();
    assert_eq!(lockup_status(5).await, (0, 4 * day, 80, 80, 0));

    // advance to end of cliff
    advance_time(4 * day + hour).await;
    context.solana.advance_clock_by_slots(2).await;

    assert_eq!(lockup_status(5).await, (4 * day, 4 * day, 80, 80, 80));
    reset_lockup(5, 1, LockupKind::Cliff).await.unwrap();
    assert_eq!(lockup_status(5).await, (0, 1 * day, 80, 80, 0));
    withdraw(5, 10).await.expect_err("nothing unlocked");

    // advance to end of cliff again
    advance_time(day + hour).await;
    context.solana.advance_clock_by_slots(2).await;

    assert_eq!(lockup_status(5).await, (day, day, 80, 80, 80));
    withdraw(5, 10).await.unwrap();
    assert_eq!(lockup_status(5).await, (day, day, 80, 70, 70));
    deposit(5, 5).await.unwrap();
    assert_eq!(lockup_status(5).await, (0, 0, 5, 75, 75));
    reset_lockup(5, 1, LockupKind::Cliff).await.unwrap();
    assert_eq!(lockup_status(5).await, (0, 1 * day, 75, 75, 0));
    deposit(5, 15).await.unwrap();
    assert_eq!(lockup_status(5).await, (0, 1 * day, 90, 90, 0));

    Ok(())
}
