use anchor_spl::token::TokenAccount;
use program_test::*;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer, transport::TransportError};
use voter_stake_registry::state::LockupKind;

mod program_test;

fn deserialize_event<T: anchor_lang::Event>(event: &str) -> Option<T> {
    let data = base64::decode(event).ok()?;
    if data.len() < 8 || data[0..8] != T::discriminator() {
        return None;
    }
    T::try_from_slice(&data[8..]).ok()
}

#[allow(unaligned_references)]
#[tokio::test]
async fn test_print_event() -> Result<(), TransportError> {
    println!(
        "{:#?}",
        deserialize_event::<voter_stake_registry::events::DepositEntryInfo>(
            "LP4gbyknBZQAABhzAQAAAAAAGHMBAAAAAAAYcwEAAAAAAAEAAAAAAAAAAAGK6hx3fgEAAAA="
        )
        .ok_or(())
    );
    Ok(())
}

#[allow(unaligned_references)]
#[tokio::test]
async fn test_log_voter_info() -> Result<(), TransportError> {
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
    let month = year / 12;

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
            1.0,
            0,
            0,
            year,
            None,
            None,
        )
        .await;

    let voter = addin
        .create_voter(&registrar, &token_owner_record, &voter_authority, &payer)
        .await;

    addin
        .create_deposit_entry(
            &registrar,
            &voter,
            voter_authority,
            &voting_mint,
            0,
            LockupKind::Cliff,
            None,
            365, // 1 year in days
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
            12000,
        )
        .await
        .unwrap();

    // advance time, to have some decay
    addin
        .set_time_offset(&registrar, &realm_authority, month as i64)
        .await;
    context.solana.advance_clock_by_slots(2).await;

    addin.log_voter_info(&registrar, &voter, 0).await;
    let data_log = context.solana.program_output().data;
    assert_eq!(data_log.len(), 2);

    let voter_event =
        deserialize_event::<voter_stake_registry::events::VoterInfo>(&data_log[0]).unwrap();
    assert_eq!(voter_event.voting_power_locked, 12000);
    assert_eq!(
        voter_event.voting_power,
        23000, // decayed 1 month from max saturation
    );

    // advance time, to have some decay
    addin
        .set_time_offset(&registrar, &realm_authority, 2 * month as i64)
        .await;
    context.solana.advance_clock_by_slots(2).await;

    addin.log_voter_info(&registrar, &voter, 0).await;
    let data_log = context.solana.program_output().data;
    assert_eq!(data_log.len(), 2);

    let voter_event =
        deserialize_event::<voter_stake_registry::events::VoterInfo>(&data_log[0]).unwrap();
    assert_eq!(voter_event.voting_power_locked, 12000);
    assert_eq!(
        voter_event.voting_power,
        22000, // decayed 2 months from max saturation
    );

    let deposit_event =
        deserialize_event::<voter_stake_registry::events::DepositEntryInfo>(&data_log[1]).unwrap();
    assert_eq!(deposit_event.deposit_entry_index, 0);
    assert_eq!(deposit_event.voting_mint_config_index, 0);
    assert_eq!(deposit_event.unlocked, 0);
    assert_eq!(deposit_event.voting_power, voter_event.voting_power);
    assert_eq!(
        deposit_event.voting_power_locked,
        voter_event.voting_power_locked
    );
    assert!(deposit_event.locking.is_some());
    let locking = deposit_event.locking.unwrap();
    assert_eq!(locking.amount, 12000);
    
    Ok(())
}