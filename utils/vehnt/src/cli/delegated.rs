use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

use crate::cli::epoch_info::get_sub_dao_epoch_infos;

use super::*;
use anchor_client::{Client, Cluster};

use solana_account_decoder::UiAccountEncoding;
use solana_client::{
  nonblocking::rpc_client::RpcClient,
  rpc_config::RpcProgramAccountsConfig,
  rpc_filter::{Memcmp, RpcFilterType},
};
use anchor_lang::AccountDeserialize;
use solana_program::system_program;
use solana_sdk::{
  pubkey::Pubkey,
  signature::{read_keypair_file},
};

#[derive(Debug, Clone, clap::Args)]
/// Fetches all delegated positions and total HNT, veHNT, and subDAO delegations.
pub struct Delegated {
  #[arg(short, long)]
  pub keypair: String,
}

use anchor_lang::prelude::*;
use helium_sub_daos::{
  caclulate_vhnt_info, current_epoch, DelegatedPositionV0,
  PrecisePosition, SubDaoEpochInfoV0, SubDaoV0,
};

#[allow(unused)]
/// This function can be used when a single query is too big
async fn get_stake_accounts_incremental(
  rpc_client: &RpcClient,
) -> MyResult<Vec<(Pubkey, solana_sdk::account::Account)>> {
  let mut prefix = [251, 212, 32, 100, 102, 1, 247, 81, 0];
  let mut accounts = Vec::new();
  for i in 0..255 {
    prefix[8] = i;
    accounts.extend(get_accounts_with_prefix(&rpc_client, &prefix).await?);
  }
  Ok(accounts)
}

/// This function will work until there's too many to fetch in a single call
async fn get_stake_accounts(
  rpc_client: &RpcClient,
) -> MyResult<Vec<(Pubkey, solana_sdk::account::Account)>> {
  const DELEGATE_POSITION_V0_DESCRIMINATOR: [u8; 8] = [251, 212, 32, 100, 102, 1, 247, 81];
  get_accounts_with_prefix(&rpc_client, &DELEGATE_POSITION_V0_DESCRIMINATOR).await
}

async fn get_accounts_with_prefix(
  rpc_client: &RpcClient,
  input: &[u8],
) -> MyResult<Vec<(Pubkey, solana_sdk::account::Account)>> {
  let helium_dao_id = Pubkey::from_str(HELIUM_DAO_ID)?;
  let mut config = RpcProgramAccountsConfig::default();
  let memcmp = RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, &input));
  config.filters = Some(vec![RpcFilterType::DataSize(196), memcmp]);
  config.account_config.encoding = Some(UiAccountEncoding::Base64);
  let accounts = rpc_client
    .get_program_accounts_with_config(&helium_dao_id, config)
    .await?;
  Ok(accounts)
}

pub struct FullPosition {
  pub position_key: Pubkey,
  pub delegated_position_key: Pubkey,
  pub position: PositionV0,
  pub delegated_position: DelegatedPositionV0,
}

const BATCH_SIZE: usize = 100;
impl Delegated {
  pub async fn run(self, rpc_client: RpcClient, solana_url: String) -> MyResult {
    let mut total_hnt = 0_u64;
    let mut total_vehnt = 0_u128;
    let mut mobile_vehnt = 0_u128;
    let mut iot_vehnt = 0_u128;
    let mut iot_fall_rate = 0_u128;
    let mut mobile_fall_rate = 0_u128;

    let accounts = get_stake_accounts(&rpc_client).await?;
    let delegated_positions = accounts
      .iter()
      .map(|(pubkey, account)| {
        let mut data = account.data.as_slice();
        DelegatedPositionV0::try_deserialize(&mut data).map(|position| (pubkey, position))
      })
      .map(|result| result.unwrap())
      .collect::<Vec<_>>();

    let position_keys = delegated_positions
      .iter()
      .map(|(_pubkey, delegated_position)| delegated_position.position)
      .collect::<Vec<Pubkey>>();

    let mut positions_raw = Vec::new();
    for chunk in position_keys.chunks(BATCH_SIZE) {
      let chunk_positions_raw = rpc_client.get_multiple_accounts(chunk).await?;
      positions_raw.extend(chunk_positions_raw);
    }

    let positions_with_delegations: Vec<FullPosition> = delegated_positions
      .iter()
      .zip(positions_raw)
      .map(|((pubkey, delegated_position), position)| {
        let position_unwrapped = position.unwrap();
        let mut data = position_unwrapped.data.as_slice();
        let position_parsed = PositionV0::try_deserialize(&mut data).unwrap();
        FullPosition {
          position_key: delegated_position.position,
          delegated_position_key: **pubkey,
          position: position_parsed,
          delegated_position: delegated_position.clone(),
        }
      })
      .collect();

    let registrar_keys: Vec<Pubkey> = positions_with_delegations
      .iter()
      .map(|p| p.position.registrar)
      .collect::<HashSet<_>>()
      .into_iter()
      .collect();
    let registrars_raw = rpc_client.get_multiple_accounts(&registrar_keys).await?;
    let registrars: Vec<Registrar> = registrars_raw
      .iter()
      .map(|registrar| {
        let mut data = registrar.as_ref().unwrap().data.as_slice();
        Registrar::try_deserialize(&mut data)
      })
      .map(|result| result.unwrap())
      .collect();

    let voting_mint_config = registrars[0].voting_mints[0].clone();

    let iot_sub_dao_raw = rpc_client
      .get_account(&Pubkey::from_str(IOT_SUBDAO).unwrap())
      .await?;
    let iot_sub_dao = SubDaoV0::try_deserialize(&mut iot_sub_dao_raw.data.as_slice())?;
    let mobile_sub_dao_raw = rpc_client
      .get_account(&Pubkey::from_str(MOBILE_SUBDAO).unwrap())
      .await?;
    let mobile_sub_dao = SubDaoV0::try_deserialize(&mut mobile_sub_dao_raw.data.as_slice())?;
    let curr_ts = std::cmp::max(
      iot_sub_dao.vehnt_last_calculated_ts,
      mobile_sub_dao.vehnt_last_calculated_ts,
    );

    let infos = get_sub_dao_epoch_infos(&rpc_client).await.unwrap();
    let mut epoch_infos_by_subdao_and_epoch: HashMap<
      Pubkey,
      HashMap<u64, (Pubkey, SubDaoEpochInfoV0)>,
    > = HashMap::new();
    epoch_infos_by_subdao_and_epoch.insert(Pubkey::from_str(IOT_SUBDAO).unwrap(), HashMap::new());
    epoch_infos_by_subdao_and_epoch
      .insert(Pubkey::from_str(MOBILE_SUBDAO).unwrap(), HashMap::new());
    for info in infos {
      epoch_infos_by_subdao_and_epoch
        .get_mut(&info.1.sub_dao)
        .unwrap()
        .insert(info.1.epoch, info);
    }
    let mut new_epoch_infos_by_subdao_and_epoch: HashMap<
      Pubkey,
      HashMap<u64, (Pubkey, SubDaoEpochInfoV0)>,
    > = HashMap::new();
    new_epoch_infos_by_subdao_and_epoch
      .insert(Pubkey::from_str(IOT_SUBDAO).unwrap(), HashMap::new());
    new_epoch_infos_by_subdao_and_epoch
      .insert(Pubkey::from_str(MOBILE_SUBDAO).unwrap(), HashMap::new());

    println!("Total accounts {}", positions_with_delegations.len());
    for position in positions_with_delegations {
      let vehnt_info = caclulate_vhnt_info(
        position.delegated_position.start_ts,
        &position.position,
        &voting_mint_config,
      )?;
      let vehnt = position
        .position
        .voting_power_precise(&voting_mint_config, curr_ts)?;

      total_vehnt += vehnt;
      let epoch_infos_by_epoch = epoch_infos_by_subdao_and_epoch
        .get_mut(&position.delegated_position.sub_dao)
        .unwrap();
      let new_epoch_infos_by_epoch = new_epoch_infos_by_subdao_and_epoch
        .get_mut(&position.delegated_position.sub_dao)
        .unwrap();
      let end_epoch = current_epoch(position.position.lockup.end_ts);
      let genesis_end_epoch = current_epoch(position.position.genesis_end - 1);

      // Initialize a new epoch info from the existing one if it hasn't been already
      {
        let has_new_epoch_info = new_epoch_infos_by_epoch.contains_key(&end_epoch);
        let end_epoch_info = epoch_infos_by_epoch.get_mut(&end_epoch).unwrap();

        if !has_new_epoch_info {
          let mut new = end_epoch_info.clone();
          new.1.vehnt_in_closing_positions = 0;
          new.1.fall_rates_from_closing_positions = 0;
          new_epoch_infos_by_epoch.insert(end_epoch, new);
        }
      }
      {
        let has_new_epoch_info = new_epoch_infos_by_epoch.contains_key(&genesis_end_epoch);
        if genesis_end_epoch > 0 {
          let genesis_end_epoch_info = epoch_infos_by_epoch
            .get(&genesis_end_epoch)
            .map(|v| v.clone())
            .unwrap_or_else(|| {
              (
                Pubkey::find_program_address(
                  &[
                    b"sub_dao_epoch_info",
                    position.delegated_position.sub_dao.as_ref(),
                    &genesis_end_epoch.to_le_bytes(),
                  ],
                  &helium_sub_daos::id(),
                )
                .0,
                SubDaoEpochInfoV0 {
                  epoch: genesis_end_epoch,
                  sub_dao: position.delegated_position.sub_dao,
                  ..SubDaoEpochInfoV0::default()
                },
              )
            });
          if !has_new_epoch_info {
            let mut new = genesis_end_epoch_info.clone();
            new.1.vehnt_in_closing_positions = 0;
            new.1.fall_rates_from_closing_positions = 0;
            new_epoch_infos_by_epoch.insert(genesis_end_epoch, new);
          }
        }
      }

      // Apply corrections
      {
        let mut new_end_epoch_info = new_epoch_infos_by_epoch.get_mut(&end_epoch).unwrap();
        new_end_epoch_info.1.fall_rates_from_closing_positions +=
          vehnt_info.end_fall_rate_correction;
        new_end_epoch_info.1.vehnt_in_closing_positions += vehnt_info.end_vehnt_correction;
      }
      {
        if genesis_end_epoch > 0 {
          let mut new_genesis_end_epoch_info = new_epoch_infos_by_epoch
            .get_mut(&genesis_end_epoch)
            .unwrap();

          new_genesis_end_epoch_info
            .1
            .fall_rates_from_closing_positions += vehnt_info.genesis_end_fall_rate_correction;
          new_genesis_end_epoch_info.1.vehnt_in_closing_positions +=
            vehnt_info.genesis_end_vehnt_correction;
        }
      }

      if position.position.lockup.kind == LockupKind::Constant
        || current_epoch(position.position.lockup.end_ts) > current_epoch(curr_ts)
      {
        match SubDao::try_from(position.delegated_position.sub_dao).unwrap() {
          SubDao::Mobile => {
            mobile_vehnt += vehnt;
            if curr_ts >= position.position.genesis_end {
              mobile_fall_rate += vehnt_info.post_genesis_end_fall_rate;
            } else {
              mobile_fall_rate += vehnt_info.pre_genesis_end_fall_rate;
            }
          }
          SubDao::Iot => {
            iot_vehnt += vehnt;
            if curr_ts >= position.position.genesis_end {
              iot_fall_rate += vehnt_info.post_genesis_end_fall_rate;
            } else {
              iot_fall_rate += vehnt_info.pre_genesis_end_fall_rate;
            }
          }
        }
      }
      total_hnt += position.delegated_position.hnt_amount
    }

    let anchor_client = Client::new_with_options(
      Cluster::Custom(
        solana_url.clone(),
        solana_url
          .clone()
          .replace("https", "wss")
          .replace("http", "ws"),
      ),
      Rc::new(read_keypair_file(self.keypair).unwrap()),
      CommitmentConfig::confirmed(),
    );
    let program = anchor_client
      .program(Pubkey::from_str("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR").unwrap());
    for (key, value) in epoch_infos_by_subdao_and_epoch.iter() {
      if let Some(new_value) = new_epoch_infos_by_subdao_and_epoch.get(key) {
        for (inner_key, sub_dao_epoch_info) in value.iter() {
          // Don't bother correcting old epochs
          if *inner_key > current_epoch(curr_ts) {
            if let Some(new_sub_dao_epoch_info) = new_value.get(inner_key) {
              let has_fall_rate_diff = sub_dao_epoch_info.1.fall_rates_from_closing_positions
                != new_sub_dao_epoch_info.1.fall_rates_from_closing_positions;
              let has_vehnt_diff = sub_dao_epoch_info.1.vehnt_in_closing_positions
                != new_sub_dao_epoch_info.1.vehnt_in_closing_positions;
              if has_fall_rate_diff || has_vehnt_diff {
                println!(
                  "Entry for key {:?},
                  Fall Rates: {}
                              {}
                  VeHNT:      {}
                              {}
                ",
                  sub_dao_epoch_info.0,
                  sub_dao_epoch_info.1.fall_rates_from_closing_positions,
                  new_sub_dao_epoch_info.1.fall_rates_from_closing_positions,
                  sub_dao_epoch_info.1.vehnt_in_closing_positions,
                  new_sub_dao_epoch_info.1.vehnt_in_closing_positions
                );
                // Uncomment if endpoint added back and needed.
                // loop {
                //   println!("Correcting...");
                //   let res = program
                //   .request()
                //   .args(helium_sub_daos::instruction::TempUpdateSubDaoEpochInfo {
                //     args: TempUpdateSubDaoEpochInfoArgs {
                //       fall_rates_from_closing_positions: if has_fall_rate_diff {
                //         Some(new_sub_dao_epoch_info.1.fall_rates_from_closing_positions)
                //       } else {
                //         None
                //       },
                //       vehnt_in_closing_positions: if has_vehnt_diff {
                //         Some(new_sub_dao_epoch_info.1.vehnt_in_closing_positions)
                //       } else {
                //         None
                //       },
                //       epoch: new_sub_dao_epoch_info.1.epoch,
                //     },
                //   })
                //   .accounts(TempUpdateSubDaoEpochInfo {
                //     sub_dao_epoch_info: sub_dao_epoch_info.0,
                //     authority: Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW")
                //       .unwrap(),
                //     sub_dao: new_sub_dao_epoch_info.1.sub_dao,
                //     system_program: system_program::id(),
                //   })
                //   .send();
                //   if res.is_ok() {
                //     break;
                //   }
                // }
              }
            }
          }
        }
      } else {
        println!("Key {:?} is in epoch_infos but not in epoch_infos_new", key);
      }
    }

    println!(
      "Total HNT staked   : {} {}",
      total_hnt, iot_sub_dao.vehnt_last_calculated_ts
    );

    let mobile_vehnt_est = mobile_sub_dao.vehnt_delegated
      - mobile_sub_dao.vehnt_fall_rate
        * u128::try_from(curr_ts - mobile_sub_dao.vehnt_last_calculated_ts).unwrap();

    let iot_vehnt_est = iot_sub_dao.vehnt_delegated
      - (iot_sub_dao.vehnt_fall_rate
        * u128::try_from(curr_ts - iot_sub_dao.vehnt_last_calculated_ts).unwrap());

    println!("Total MOBILE veHNT : {}", mobile_vehnt);
    println!("Est MOBILE veHNT   : {}", mobile_vehnt_est);
    println!(
      "MOBILE veHNT Diff  : {}",
      i128::try_from(mobile_vehnt_est).unwrap() - i128::try_from(mobile_vehnt).unwrap()
    );
    println!("Total IOT veHNT    : {}", iot_vehnt);
    println!("Est IOT veHNT      : {}", iot_vehnt_est);
    println!(
      "IOT veHNT Diff     : {}",
      i128::try_from(iot_vehnt_est).unwrap() - i128::try_from(iot_vehnt).unwrap()
    );
    println!("Total veHNT        : {}", total_vehnt);
    println!("mobile fall        : {}", mobile_fall_rate);
    println!("mobile est fall    : {}", mobile_sub_dao.vehnt_fall_rate);
    println!(
      "mobile diff        : {}",
      i128::try_from(mobile_sub_dao.vehnt_fall_rate).unwrap()
        - i128::try_from(mobile_fall_rate).unwrap()
    );
    println!("iot fall           : {}", iot_fall_rate);
    println!("iot est fall       : {}", iot_sub_dao.vehnt_fall_rate);
    println!(
      "iot diff           : {}",
      i128::try_from(iot_sub_dao.vehnt_fall_rate).unwrap() - i128::try_from(iot_fall_rate).unwrap()
    );

    Ok(())
  }
}

use voter_stake_registry::state::{LockupKind, PositionV0, Registrar};

#[derive(Debug)]
#[allow(unused)]
struct Position {
  pub mint: Pubkey,
  pub position: Pubkey,
  pub hnt_amount: u64,
  pub sub_dao: Pubkey,
  pub last_claimed_epoch: u64,
  pub start_ts: i64,
  pub purged: bool,
  pub bump_seed: u8,
}

impl TryFrom<DelegatedPositionV0> for Position {
  type Error = super::error::Error;
  fn try_from(position: DelegatedPositionV0) -> MyResult<Self> {
    Ok(Self {
      mint: position.mint,
      position: position.position,
      hnt_amount: position.hnt_amount,
      sub_dao: position.sub_dao,
      last_claimed_epoch: position.last_claimed_epoch,
      start_ts: position.start_ts,
      purged: position.purged,
      bump_seed: position.bump_seed,
    })
  }
}
