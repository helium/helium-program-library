use anchor_spl::token::TokenAccount;
use program_test::*;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer, transport::TransportError};
use voter_stake_registry::state::LockupKind;

mod program_test;

#[allow(unaligned_references)]
#[tokio::test]
async fn test_all_deposits() -> Result<(), TransportError> {
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
  let voter_mngo = context.users[1].token_accounts[0];
  let token_owner_record = realm
    .create_token_owner_record(voter_authority.pubkey(), &payer)
    .await;

  let registrar = addin
    .create_registrar(&realm, &realm_authority, payer)
    .await;
  let day = 24 * 60 * 60;
  let year = 365 * day;
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
      5 * year,
      None,
      None,
    )
    .await;

  let voter = addin
    .create_voter(&registrar, &token_owner_record, &voter_authority, &payer)
    .await;

  let reference_account = context.users[1].token_accounts[0];

  let withdraw = |amount: u64| {
    addin.withdraw(
      &registrar,
      &voter,
      &voting_mint,
      &voter_authority,
      reference_account,
      0,
      amount,
    )
  };

  for i in 0..32 {
    addin
      .create_deposit_entry(
        &registrar,
        &voter,
        voter_authority,
        &voting_mint,
        i,
        LockupKind::Cliff,
        None,
        365, // 1 year lockup
      )
      .await
      .unwrap();
    addin
      .deposit(
        &registrar,
        &voter,
        &voting_mint,
        voter_authority,
        voter_mngo,
        i,
        12000,
      )
      .await
      .unwrap();
  }

  // advance time, to be in the middle of all deposit lockups
  addin
    .set_time_offset(&registrar, &realm_authority, 32 * 24 * 60 * 60 as i64)
    .await;
  context.solana.advance_clock_by_slots(2).await;

  // the two most expensive calls which scale with number of deposts
  // are update_voter_weight_record and withdraw - both compute the vote weight
  let vwr = addin
    .update_voter_weight_record(&registrar, &voter)
    .await
    .unwrap();
  assert_eq!(vwr.voter_weight, 12000 * 32);

  withdraw(1).await.expect_err("nothing vested yet");

  // advance more than cliff
  addin
    .set_time_offset(&registrar, &realm_authority, 6 * year as i64)
    .await;
  context.solana.advance_clock_by_slots(2).await;

  // can withdraw everything now
  withdraw(12001).await.expect_err("withdrew too much");
  withdraw(12000).await.unwrap();

  // logging can take a lot of cu/mem
  addin.log_voter_info(&registrar, &voter, 0).await;

  Ok(())
}
