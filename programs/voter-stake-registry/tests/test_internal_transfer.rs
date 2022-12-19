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
async fn test_internal_transfer() -> Result<(), TransportError> {
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
  let internal_transfer_locked = |source: u8, target: u8, amount: u64| {
    addin.internal_transfer_locked(&registrar, &voter, &voter_authority, source, target, amount)
  };
  let internal_transfer_unlocked = |source: u8, target: u8, amount: u64| {
    addin.internal_transfer_unlocked(&registrar, &voter, &voter_authority, source, target, amount)
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

  addin
    .create_deposit_entry(
      &registrar,
      &voter,
      &voter_authority,
      &voting_mint,
      0,
      LockupKind::None,
      None,
      0,
    )
    .await
    .unwrap();
  deposit(0, 300).await.unwrap();

  addin
    .create_deposit_entry(
      &registrar,
      &voter,
      &voter_authority,
      &voting_mint,
      1,
      LockupKind::None,
      None,
      0,
    )
    .await
    .unwrap();

  deposit(1, 30).await.unwrap();

  //
  // test transfering unlocked funds
  //
  internal_transfer_unlocked(2, 0, 1000)
    .await
    .expect_err("deposit entry not in use");
  internal_transfer_unlocked(1, 0, 31)
    .await
    .expect_err("amount too high");
  internal_transfer_unlocked(1, 0, 10).await.unwrap();
  assert_eq!(lockup_status(0).await, (0, 0, 300, 310, 310));
  assert_eq!(lockup_status(1).await, (0, 0, 30, 20, 20));

  internal_transfer_unlocked(0, 1, 100).await.unwrap();
  assert_eq!(lockup_status(0).await, (0, 0, 300, 210, 210));
  assert_eq!(lockup_status(1).await, (0, 0, 30, 120, 120));

  //
  // test partially moving tokens from constant deposit to cliff
  //
  addin
    .create_deposit_entry(
      &registrar,
      &voter,
      &voter_authority,
      &voting_mint,
      2,
      LockupKind::Constant,
      None,
      5,
    )
    .await
    .unwrap();
  deposit(2, 1000).await.unwrap();
  addin
    .create_deposit_entry(
      &registrar,
      &voter,
      &voter_authority,
      &voting_mint,
      3,
      LockupKind::Cliff,
      None,
      5,
    )
    .await
    .unwrap();
  assert_eq!(lockup_status(2).await, (0, 5 * day, 1000, 1000, 0));
  assert_eq!(lockup_status(3).await, (0, 5 * day, 0, 0, 0));

  internal_transfer_locked(2, 3, 100).await.unwrap();

  context.solana.advance_clock_by_slots(2).await;
  assert_eq!(lockup_status(2).await, (0, 5 * day, 900, 900, 0));
  assert_eq!(lockup_status(3).await, (0, 5 * day, 100, 100, 0));

  advance_time(2 * day + hour).await;

  internal_transfer_locked(2, 3, 100)
    .await
    .expect_err("target deposit has not enough period left");

  addin
    .create_deposit_entry(
      &registrar,
      &voter,
      &voter_authority,
      &voting_mint,
      4,
      LockupKind::Cliff,
      None,
      8,
    )
    .await
    .unwrap();
  internal_transfer_locked(2, 4, 100).await.unwrap();

  assert_eq!(lockup_status(2).await, (0, 5 * day, 800, 800, 0));
  assert_eq!(
    lockup_status(3).await,
    (2 * day + hour, 5 * day, 100, 100, 0)
  );
  assert_eq!(lockup_status(4).await, (0, 8 * day, 100, 100, 0));

  advance_time(day + hour).await;
  context.solana.advance_clock_by_slots(2).await;

  // still ok, cliff deposit 4 still has 7 days of lockup left, which is >= 5
  internal_transfer_locked(2, 4, 800).await.unwrap();

  assert_eq!(lockup_status(2).await, (0, 5 * day, 0, 0, 0));
  assert_eq!(lockup_status(4).await, (hour, 7 * day, 900, 900, 0));

  Ok(())
}
