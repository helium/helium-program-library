#![allow(clippy::await_holding_refcell_ref)]

use anchor_spl::token::TokenAccount;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer, transport::TransportError};

use program_test::*;
use voter_stake_registry::state::Voter;

mod program_test;

#[allow(unaligned_references)]
#[tokio::test]
async fn test_basic() -> Result<(), TransportError> {
  let context = TestContext::new().await;

  let payer = &context.users[0].key;
  let realm_authority = Keypair::new();
  let realm = context
    .governance
    .create_realm(
      "testrealm",
      realm_authority.pubkey(),
      &context.mints[0],
      payer,
      &context.addin.program_id,
    )
    .await;

    let voter_authority = &context.users[1].key;
  let token_owner_record = realm
    .create_token_owner_record(voter_authority.pubkey(), payer)
    .await;

  let registrar = context
    .addin
    .create_registrar(&realm, &realm_authority, payer)
    .await;
  context
    .addin
    .configure_voting_mint(
      &registrar,
      &realm_authority,
      payer,
      0,
      &context.mints[0],
      10,
      0.0,
      0,
      0.0,
      0,
      0,
      1,
      None,
      None,
    )
    .await;
  let voting_mint = context
    .addin
    .configure_voting_mint(
      &registrar,
      &realm_authority,
      payer,
      0,
      &context.mints[0],
      0,
      0.0,
      0,
      0.0,
      0,
      0,
      5 * 365 * 24 * 60 * 60,
      None,
      None,
    )
    .await;

  let voter = context
    .addin
    .create_voter(&registrar, &token_owner_record, voter_authority, payer)
    .await;

  // create the voter again, should have no effect
  context
    .addin
    .create_voter(&registrar, &token_owner_record, voter_authority, payer)
    .await;

  // test deposit and withdraw

  let reference_account = context.users[1].token_accounts[0];
  let reference_initial = context
    .solana
    .token_account_balance(reference_account)
    .await;
  let balance_initial = voter.deposit_amount(&context.solana, 0).await;
  assert_eq!(balance_initial, 0);

  context
    .addin
    .create_deposit_entry(
      &registrar,
      &voter,
      voter_authority,
      &voting_mint,
      0,
      voter_stake_registry::state::LockupKind::Cliff,
      None,
      0,
    )
    .await?;
  context
    .addin
    .deposit(
      &registrar,
      &voter,
      &voting_mint,
      voter_authority,
      reference_account,
      0,
      10000,
    )
    .await?;

  let reference_after_deposit = context
    .solana
    .token_account_balance(reference_account)
    .await;
  assert_eq!(reference_initial, reference_after_deposit + 10000);
  let vault_after_deposit = voting_mint.vault_balance(&context.solana, &voter).await;
  assert_eq!(vault_after_deposit, 10000);
  let balance_after_deposit = voter.deposit_amount(&context.solana, 0).await;
  assert_eq!(balance_after_deposit, 10000);

  context
    .addin
    .withdraw(
      &registrar,
      &voter,
      &voting_mint,
      &context.users[2].key,
      reference_account,
      0,
      10000,
    )
    .await
    .expect_err("fails because voter_authority is invalid");

  context
    .addin
    .withdraw(
      &registrar,
      &voter,
      &voting_mint,
      voter_authority,
      reference_account,
      0,
      10000,
    )
    .await?;

  let reference_after_withdraw = context
    .solana
    .token_account_balance(reference_account)
    .await;
  assert_eq!(reference_initial, reference_after_withdraw);
  let vault_after_withdraw = voting_mint.vault_balance(&context.solana, &voter).await;
  assert_eq!(vault_after_withdraw, 0);
  let balance_after_withdraw = voter.deposit_amount(&context.solana, 0).await;
  assert_eq!(balance_after_withdraw, 0);

  let lamports_before = context
    .solana
    .context
    .borrow_mut()
    .banks_client
    .get_balance(voter_authority.pubkey())
    .await?;
  context
    .addin
    .close_voter(&registrar, &voter, &voting_mint, voter_authority)
    .await?;
  let lamports_after = context
    .solana
    .context
    .borrow_mut()
    .banks_client
    .get_balance(voter_authority.pubkey())
    .await?;
  let token_rent = context.solana.rent.minimum_balance(TokenAccount::LEN);
  let voter_rent = context
    .solana
    .rent
    .minimum_balance(std::mem::size_of::<Voter>());
  let tolerance = 60_000;
  assert!(lamports_after > lamports_before + voter_rent + token_rent - tolerance);

  Ok(())
}
