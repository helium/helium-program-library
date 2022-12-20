use anchor_spl::token::TokenAccount;
use program_test::*;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer, transport::TransportError};
use voter_stake_registry::state::LockupKind;

mod program_test;

#[allow(unaligned_references)]
#[tokio::test]
async fn test_voting() -> Result<(), TransportError> {
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
      payer,
      &context.addin.program_id,
    )
    .await;

  let voter_authority = &context.users[1].key;
  let voter2_authority = &context.users[2].key;
  let voter_mngo = context.users[1].token_accounts[0];
  let voter_usdc = context.users[1].token_accounts[1];
  let token_owner_record = realm
    .create_token_owner_record(voter_authority.pubkey(), payer)
    .await;
  let token_owner_record2 = realm
    .create_token_owner_record(voter2_authority.pubkey(), payer)
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
      2.0,
      0,
      0.0,
      0,
      0,
      5 * 365 * 24 * 60 * 60,
      None,
      None,
    )
    .await;
  let usdc_voting_mint = addin
    .configure_voting_mint(
      &registrar,
      &realm_authority,
      payer,
      1,
      &context.mints[1],
      0,
      0.0,
      0,
      0.0,
      0,
      0,
      5 * 365 * 24 * 60 * 60,
      None,
      Some(&[context.mints[0].pubkey.unwrap()]),
    )
    .await;

  let voter = addin
    .create_voter(&registrar, &token_owner_record, voter_authority, payer)
    .await;
  let voter2 = addin
    .create_voter(&registrar, &token_owner_record2, voter2_authority, payer)
    .await;

  let reset_lockup = |index: u8, periods: u32, kind: LockupKind| {
    addin.reset_lockup(&registrar, &voter, voter_authority, index, kind, periods)
  };
  let mint_governance = realm
    .create_mint_governance(
      context.mints[0].pubkey.unwrap(),
      &context.mints[0].authority,
      &voter,
      voter_authority,
      payer,
      addin.update_voter_weight_record_instruction(&registrar, &voter),
    )
    .await;

  addin
    .create_deposit_entry(
      &registrar,
      &voter,
      voter_authority,
      &voting_mint,
      0,
      LockupKind::None,
      None,
      0,
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
      0,
      499,
    )
    .await
    .unwrap();

  // need vote weight of 1000, but only have 0 since nothing locked up
  realm
    .create_proposal(
      mint_governance.address,
      voter_authority,
      &voter,
      payer,
      addin.update_voter_weight_record_instruction(&registrar, &voter),
    )
    .await
    .expect_err("not enough tokens to create proposal");

  // reset lockup to cliff to gain power
  reset_lockup(0, 2, LockupKind::Cliff).await.unwrap();
  addin
    .deposit(
      &registrar,
      &voter,
      &voting_mint,
      voter_authority,
      voter_mngo,
      0,
      1,
    )
    .await
    .unwrap();
  context.solana.advance_clock_by_slots(2).await; // avoid cache when sending same transaction again

  let proposal = realm
    .create_proposal(
      mint_governance.address,
      voter_authority,
      &voter,
      payer,
      addin.update_voter_weight_record_instruction(&registrar, &voter),
    )
    .await
    .unwrap();

  // having created a proposal, withdrawing is impossible
  context.solana.advance_clock_by_slots(2).await; // avoid cache when sending same transaction again
  addin
    .withdraw(
      &registrar,
      &voter,
      &voting_mint,
      voter_authority,
      voter_mngo,
      0,
      1,
    )
    .await
    .expect_err("could not withdraw");

  addin
    .create_deposit_entry(
      &registrar,
      &voter2,
      voter2_authority,
      &voting_mint,
      0,
      LockupKind::Cliff,
      None,
      2,
    )
    .await
    .unwrap();
  addin
    .deposit(
      &registrar,
      &voter2,
      &voting_mint,
      voter_authority,
      voter_mngo,
      0,
      750,
    )
    .await
    .unwrap();

  addin
    .create_deposit_entry(
      &registrar,
      &voter2,
      voter2_authority,
      &usdc_voting_mint,
      1,
      LockupKind::None,
      None,
      0,
    )
    .await
    .unwrap();
  addin
    .deposit(
      &registrar,
      &voter2,
      &usdc_voting_mint,
      voter_authority,
      voter_usdc,
      1,
      1000,
    )
    .await
    .unwrap();

  realm
    .cast_vote(
      mint_governance.address,
      &proposal,
      &voter2,
      voter2_authority,
      payer,
      addin.update_voter_weight_record_instruction(&registrar, &voter2),
    )
    .await
    .unwrap();

  let proposal_data = context.solana.get_account_data(proposal.address).await;
  let mut data_slice: &[u8] = &proposal_data;
  let proposal_state: spl_governance::state::proposal::ProposalV2 =
    anchor_lang::AnchorDeserialize::deserialize(&mut data_slice).unwrap();
  assert_eq!(proposal_state.options[0].vote_weight, 2 * 750);
  assert_eq!(proposal_state.deny_vote_weight.unwrap(), 0);

  // having voted, the funds are now locked, withdrawing is impossible
  context.solana.advance_clock_by_slots(2).await; // avoid cache when sending same transaction again
  addin
    .withdraw(
      &registrar,
      &voter2,
      &voting_mint,
      voter2_authority,
      voter_mngo,
      0,
      1,
    )
    .await
    .expect_err("could not withdraw");

  // but can withdraw USDC
  addin
    .withdraw(
      &registrar,
      &voter2,
      &usdc_voting_mint,
      voter2_authority,
      voter_usdc,
      1,
      1,
    )
    .await
    .unwrap();

  realm
    .relinquish_vote(
      mint_governance.address,
      &proposal,
      voter2.token_owner_record,
      voter2_authority,
      payer.pubkey(),
    )
    .await
    .unwrap();

  // cant withdraw becuase cliff is still active
  addin
    .withdraw(
      &registrar,
      &voter2,
      &voting_mint,
      voter2_authority,
      voter_mngo,
      0,
      750,
    )
    .await
    .expect_err("could not withdraw");

  // advance to end of cliff
  addin
    .set_time_offset(&registrar, &realm_authority, 6 * 24 * 60 * 60)
    .await;
  context.solana.advance_clock_by_slots(2).await; // avoid cache when sending same transaction again

  // can withdraw again
  addin
    .withdraw(
      &registrar,
      &voter2,
      &voting_mint,
      voter2_authority,
      voter_mngo,
      0,
      750,
    )
    .await
    .unwrap();

  Ok(())
}
