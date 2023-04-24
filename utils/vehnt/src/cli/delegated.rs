use std::collections::{HashMap, HashSet};

use super::*;
use serde::Deserialize;

use postgres_types::FromSql;
use solana_account_decoder::UiAccountEncoding;
use solana_client::{
  nonblocking::rpc_client::RpcClient,
  rpc_config::RpcProgramAccountsConfig,
  rpc_filter::{Memcmp, RpcFilterType},
};

use solana_sdk::pubkey::Pubkey;

use postgres::{Client, NoTls};
pub struct ReadablePosition {
  pub address: String,
  pub ve_tokens: Decimal,
}

#[derive(Debug, Clone, clap::Args)]
/// Fetches all delegated positions and total HNT, veHNT, and subDAO delegations.
pub struct Delegated {
  #[arg(short, long)]
  pub curr_ts: i64,
}

use anchor_lang::prelude::*;
use helium_sub_daos::{caclulate_vhnt_info, DelegatedPositionV0, PrecisePosition, SubDaoV0};

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

#[derive(Deserialize, Debug)]
#[allow(unused)]
struct PositionInfo {
  pub name: String,
  pub description: String,
  pub image: String,
  pub attributes: Vec<Attribute>,
}

#[derive(Debug)]
struct Info {
  start_ts: usize,
  end_ts: usize,
  kind: String,
}
use rust_decimal::{prelude::ToPrimitive, Decimal};

impl Info {
  fn get_multiple(&self) -> Decimal {
    let stake_seconds = self.end_ts - self.start_ts;
    let stake_days = stake_seconds / (60 * 60 * 24);
    Decimal::from(stake_days * 100 * 3) / Decimal::from(1460)
  }
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "trait_type", content = "value")]
/// Helper type for deserializing data from https://positions.nft.helium.io
enum Attribute {
  Registrar(String),
  AmountDepositedNative(String),
  AmountDeposited(String),
  VotingMintConfigIdx(usize),
  VotingMint(String),
  StartTs(String),
  EndTs(String),
  Kind(String),
  GenesisEnd(String),
  NumActiveVotes(usize),
}

/// Uses https://positions.nft.helium.io to get details about the position
async fn get_position_info(position: &Position) -> MyResult<Info> {
  let url = format!(
    "https://positions.nft.helium.io/{}",
    position.mint.to_string()
  );
  let mut response = reqwest::get(&url).await;
  while response.is_err() {
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    response = reqwest::get(&url).await;
  }
  let position_info: PositionInfo = response?.json().await?;
  let mut info = Info {
    start_ts: 0,
    end_ts: 0,
    kind: "".to_string(),
  };
  for attribute in position_info.attributes {
    match attribute {
      Attribute::StartTs(s) => info.start_ts = s.parse::<usize>()?,
      Attribute::EndTs(s) => info.end_ts = s.parse::<usize>()?,
      Attribute::Kind(s) => info.kind = s,
      _ => (),
    }
  }
  //TODO: check if any of the fields above are still default
  Ok(info)
}

pub struct FullPosition {
  pub position_key: Pubkey,
  pub delegated_position_key: Pubkey,
  pub position: PositionV0,
  pub delegated_position: DelegatedPositionV0,
}
const BATCH_SIZE: usize = 100;
impl Delegated {
  pub async fn run(self, rpc_client: RpcClient) -> MyResult {
    let mut total_hnt = 0_u64;
    let mut total_vehnt = 0_u128;
    let mut mobile_vehnt = 0_u128;
    let mut iot_vehnt = 0_u128;
    let mut iot_fall_rate = 0_u128;
    let mut mobile_fall_rate = 0_u128;

    let mut client =
      Client::connect("postgres://postgres:postgres@localhost/solana", NoTls).unwrap();
    let rows = client.query("
WITH
  readable_positions AS (
    SELECT p.*,
      r.realm_governing_token_mint,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'lockupSaturationSecs' as numeric) as lockup_saturation_seconds,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'maxExtraLockupVoteWeightScaledFactor' as numeric) / 1000000000 as max_extra_lockup_vote_weight_scaled_factor,
      CASE WHEN p.genesis_end > current_ts THEN cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'genesisVotePowerMultiplier' as numeric) ELSE 1 END as genesis_multiplier,
      GREATEST(
        cast(
          p.end_ts - 
          CASE WHEN lockup_kind = 'constant' THEN start_ts ELSE current_ts END
          as numeric
        ),
        0
      )
       as seconds_remaining
    FROM (
      SELECT *,
        lockup->>'kind' as lockup_kind,
        cast(lockup->>'endTs' as numeric) as end_ts,
        cast(lockup->>'startTs' as numeric) as start_ts,
        -- 1682365045 as current_ts
        FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)) as current_ts
      FROM positions 
    ) p
    JOIN registrars r on p.registrar = r.address
  ),
  positions_with_vehnt AS (
    SELECT realm_governing_token_mint as mint,
      address,
      num_active_votes,
      registrar,
      refreshed_at,
      created_at,
      amount_deposited_native,
      ve_tokens,
      initial_ve_tokens,
      CASE WHEN lockup_kind = 'constant' THEN 
        0
      ELSE 
        CASE WHEN current_ts < genesis_end THEN
          -- genesis
          (ve_tokens - (
              amount_deposited_native * (
                LEAST(
                  (end_ts - genesis_end) / lockup_saturation_seconds,
                  1
                ) * (
                  max_extra_lockup_vote_weight_scaled_factor
                ) * genesis_multiplier
              )
            )
          ) / (genesis_end - current_ts)
        ELSE
          -- normal
          ve_tokens / (end_ts - current_ts) 
        END
      END as fall_rate,
      start_ts,
      end_ts,
      current_ts,
      seconds_remaining
    FROM (
      SELECT *,
        amount_deposited_native * (
           (
            max_extra_lockup_vote_weight_scaled_factor
          ) * genesis_multiplier * LEAST(
            seconds_remaining / lockup_saturation_seconds,
            1
          )
        ) as ve_tokens,
        amount_deposited_native * (
          (
            max_extra_lockup_vote_weight_scaled_factor
          ) * genesis_multiplier * LEAST(
            (end_ts - start_ts) / lockup_saturation_seconds,
            1
          )
        ) as initial_ve_tokens
      FROM readable_positions
    ) a
  ),
  subdao_delegations AS (
    SELECT
      count(*) as delegations,
      min(current_ts) as current_ts,
      sum(p.fall_rate) as real_fall_rate,
      s.vehnt_fall_rate / 1000000000000 as approx_fall_rate,
      s.dnt_mint as mint,
      SUM(ve_tokens) as real_ve_tokens,
      (
        s.vehnt_delegated - (
          (min(current_ts) - s.vehnt_last_calculated_ts)
           * s.vehnt_fall_rate
        )
      ) / 1000000000000 as approx_ve_tokens,
      s.vehnt_delegated as vehnt_delegated_snapshot,
      s.vehnt_last_calculated_ts as vehnt_last_calculated_ts
    FROM positions_with_vehnt p
    JOIN delegated_positions d on d.position = p.address
    JOIN sub_daos s on s.address = d.sub_dao
    GROUP BY s.dnt_mint, s.vehnt_fall_rate, s.vehnt_delegated, s.vehnt_last_calculated_ts, s.vehnt_last_calculated_ts
  )
  SELECT cast(current_ts as bigint) as current_ts, address, cast(ve_tokens * 1000000000000 as text) as ve_tokens, cast(fall_rate * 1000000000000 as text) as fall_rate FROM positions_with_vehnt;
-- SELECT 
--   mint,
--   delegations,
--   current_ts,
--   real_ve_tokens,
--   approx_ve_tokens,
--   real_fall_rate,
--   approx_fall_rate,
--   approx_fall_rate - real_fall_rate as fall_rate_diff,
--   approx_ve_tokens - real_ve_tokens as ve_tokens_diff
-- FROM subdao_delegations;
    ", &[]).unwrap();
    let mut curr_ts = self.curr_ts;
    let mut address_map = HashMap::new();
    for row in rows {
      curr_ts = row.get("current_ts");
      let address: String = row.get("address");
      let ve_tokens_string: String = row.get("ve_tokens");
      let ve_tokens: u128 = match rust_decimal::Decimal::from_str(&ve_tokens_string) {
        Ok(decimal) => {
          decimal.floor().to_u128().unwrap()
        }
        Err(err) => {
          println!("Error parsing numeric value: {}", err);
          return Ok(());
        }
      };
      let fall_rate_string: String = row.get("fall_rate");
      let fall_rate: u128 = match rust_decimal::Decimal::from_str(&fall_rate_string) {
        Ok(decimal) => decimal.floor().to_u128().unwrap(),
        Err(err) => {
          println!("Error parsing numeric value: {}", err);
          return Ok(());
        }
      };
      address_map.insert(address, (ve_tokens, fall_rate));
    }
    println!("Current ts: {}", curr_ts);
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

    println!("Total accounts {}", positions_with_delegations.len());
    for position in positions_with_delegations {
      let vehnt_info = caclulate_vhnt_info(curr_ts, &position.position, &voting_mint_config)?;
      let vehnt = position
        .position
        .voting_power_precise(&voting_mint_config, curr_ts)?;
      if vehnt == 0 && vehnt_info.pre_genesis_end_fall_rate > 0 {
        println!("0 position with {:?} {}", vehnt_info, position.position_key);
      }
      match address_map.get(&position.position_key.to_string()) {
        Some(((pg_vehnt, pg_fall_rate))) => {
          if u128::try_from(*pg_vehnt).unwrap() / 1000000000 != vehnt / 1000000000
            || pg_fall_rate / 1000000000 != &vehnt_info.pre_genesis_end_fall_rate / 1000000000
          {
            println!(
              "Mismatched vehnt for {:?} {} {}",
              position.position_key.to_string(),
              pg_vehnt,
              vehnt
            );
          }
        }
        None => {
          println!("Missing vehnt for {:?}", position.position_key);
        }
      }

      total_vehnt += vehnt;
      match SubDao::try_from(position.delegated_position.sub_dao).unwrap() {
        SubDao::Mobile => {
          mobile_vehnt += vehnt;
          mobile_fall_rate += vehnt_info.pre_genesis_end_fall_rate;
        }
        SubDao::Iot => {
          iot_vehnt += vehnt;
          iot_fall_rate += vehnt_info.pre_genesis_end_fall_rate;
        }
      }
      total_hnt += position.delegated_position.hnt_amount
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

use helium_api::models::Hnt;
use voter_stake_registry::state::{PositionV0, Registrar};

#[derive(Debug)]
#[allow(unused)]
struct Position {
  pub mint: Pubkey,
  pub position: Pubkey,
  pub hnt_amount: Hnt,
  pub sub_dao: SubDao,
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
      hnt_amount: Hnt::from(position.hnt_amount),
      sub_dao: SubDao::try_from(position.sub_dao)?,
      last_claimed_epoch: position.last_claimed_epoch,
      start_ts: position.start_ts,
      purged: position.purged,
      bump_seed: position.bump_seed,
    })
  }
}
