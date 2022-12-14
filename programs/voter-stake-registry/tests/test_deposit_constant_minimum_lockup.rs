use anchor_spl::token::TokenAccount;
use program_test::*;
use solana_program_test::*;
use solana_sdk::{pubkey::Pubkey, signature::Keypair, signer::Signer, transport::TransportError};

mod program_test;

struct Balances {
    token: u64,
    vault: u64,
    deposit: u64,
    voter_weight: u64,
}

async fn balances(
    context: &TestContext,
    registrar: &RegistrarCookie,
    address: Pubkey,
    voter: &VoterCookie,
    voting_mint: &VotingMintConfigCookie,
    deposit_id: u8,
) -> Balances {
    // Advance slots to avoid caching of the UpdateVoterWeightRecord call
    // TODO: Is this something that could be an issue on a live node?
    context.solana.advance_clock_by_slots(2).await;

    let token = context.solana.token_account_balance(address).await;
    let vault = voting_mint.vault_balance(&context.solana, &voter).await;
    let deposit = voter.deposit_amount(&context.solana, deposit_id).await;
    let vwr = context
        .addin
        .update_voter_weight_record(&registrar, &voter)
        .await
        .unwrap();
    Balances {
        token,
        vault,
        deposit,
        voter_weight: vwr.voter_weight,
    }
}

#[allow(unaligned_references)]
#[tokio::test]
async fn test_deposit_cliff_minimum_lockup() -> Result<(), TransportError> {
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
            2 * 24 * 60 * 60, // minimum 2 days            
            2.0, // max of 2.0
            0,
            0,
            4 * 24 * 60 * 60, // 4 days for max
            None,
            None,
        )
        .await;

    let voter = addin
        .create_voter(&registrar, &token_owner_record, &voter_authority, &payer)
        .await;

    let reference_account = context.users[1].token_accounts[0];
    let get_balances = |depot_id| {
        balances(
            &context,
            &registrar,
            reference_account,
            &voter,
            &voting_mint,
            depot_id,
        )
    };        
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
    let deposit = |amount: u64| {
        addin.deposit(
            &registrar,
            &voter,
            &voting_mint,
            &voter_authority,
            reference_account,
            0,
            amount,
        )
    };    

    // test deposit and withdraw
    let token = context
        .solana
        .token_account_balance(reference_account)
        .await;

    // less than minimum lockup
    addin
        .create_deposit_entry(
            &registrar,
            &voter,
            &voter_authority,
            &voting_mint,
            0,
            voter_stake_registry::state::LockupKind::Constant,
            None,
            1, // 1 days
        )
        .await
        .expect_err("not at least minimum");
        
    // minimum lockup
    addin
        .create_deposit_entry(
            &registrar,
            &voter,
            &voter_authority,
            &voting_mint,
            0,
            voter_stake_registry::state::LockupKind::Constant,
            None,
            2, 
        )
        .await
        .unwrap();

    deposit(9000).await.unwrap();       
    
    let after_deposit = get_balances(0).await;
    assert_eq!(token, after_deposit.token + after_deposit.vault);
    assert_eq!(after_deposit.voter_weight, 1 * after_deposit.vault); // saturated locking bonus
    assert_eq!(after_deposit.vault, 9000);
    assert_eq!(after_deposit.deposit, 9000);

    withdraw(1).await.expect_err("all locked up");

    // advance three days
    addin
        .set_time_offset(&registrar, &realm_authority, 3 * 24 * 60 * 60)
        .await;
    let after_day3 = get_balances(0).await;
    assert_eq!(after_day3.voter_weight, after_deposit.voter_weight); // unchanged

    withdraw(1).await.expect_err("all locked up");

    deposit(1000).await.unwrap();

    let after_deposit = get_balances(0).await;
    assert_eq!(token, after_deposit.token + after_deposit.vault);
    assert_eq!(after_deposit.voter_weight, 1 * after_deposit.vault); // saturated locking bonus
    assert_eq!(after_deposit.vault, 10000);
    assert_eq!(after_deposit.deposit, 10000);    

    withdraw(1).await.expect_err("all locked up");

    // Change the whole thing to cliff lockup    
    addin
        .reset_lockup(
            &registrar,
            &voter,
            &voter_authority,
            0,
            voter_stake_registry::state::LockupKind::Cliff,
            1,
        )
        .await
        .expect_err("can't reduce period");    
    addin
        .reset_lockup(
            &registrar,
            &voter,
            &voter_authority,
            0,
            voter_stake_registry::state::LockupKind::Cliff,
            2,
        )
        .await
        .unwrap();

    let after_reset = get_balances(0).await;
    assert_eq!(token, after_reset.token + after_reset.vault);
    assert_eq!(after_reset.voter_weight, 1 * after_reset.vault); // saturated locking bonus
    assert_eq!(after_reset.vault, 10000);
    assert_eq!(after_reset.deposit, 10000);

    withdraw(1).await.expect_err("all locked up");        

    // advance to six days
    addin
        .set_time_offset(&registrar, &realm_authority, 6 * 24 * 60 * 60)
        .await;
    
    withdraw(10001).await.expect_err("withdrew too much");
    withdraw(10000).await.unwrap();

    let after_withdraw = get_balances(0).await;
    assert_eq!(token, after_withdraw.token + after_withdraw.vault);
    assert_eq!(after_withdraw.voter_weight, after_withdraw.vault);
    assert_eq!(after_withdraw.vault, 0);
    assert_eq!(after_withdraw.deposit, 0);

    Ok(())
}