use super::*;
use anchor_lang::AccountDeserialize;
use solana_account_decoder::UiAccountEncoding;
use solana_client::{
  nonblocking::rpc_client::RpcClient,
  rpc_config::RpcProgramAccountsConfig,
  rpc_filter::{Memcmp, RpcFilterType},
};

use solana_sdk::pubkey::Pubkey;

#[derive(Debug, Clone, clap::Args)]
/// Scrape all SubDao epoch info
pub struct EpochInfo {}
use helium_sub_daos::SubDaoEpochInfoV0;
async fn get_accounts_with_prefix(
  rpc_client: &RpcClient,
) -> MyResult<Vec<(Pubkey, solana_sdk::account::Account)>> {
  let helium_dao_id = Pubkey::from_str(HELIUM_DAO_ID)?;
  const SUB_DAO_EPOCH_INFO_DESCRIMINATOR: [u8; 8] = [45, 249, 177, 20, 170, 251, 37, 37];

  let mut config = RpcProgramAccountsConfig::default();
  let memcmp = RpcFilterType::Memcmp(Memcmp::new_base58_encoded(
    0,
    &SUB_DAO_EPOCH_INFO_DESCRIMINATOR,
  ));
  config.filters = Some(vec![RpcFilterType::DataSize(204), memcmp]);
  config.account_config.encoding = Some(UiAccountEncoding::Base64);
  let accounts = rpc_client
    .get_program_accounts_with_config(&helium_dao_id, config)
    .await?;
  Ok(accounts)
}

pub async fn get_sub_dao_epoch_infos(
  rpc_client: &RpcClient,
) -> MyResult<Vec<(Pubkey, SubDaoEpochInfoV0)>> {
  get_accounts_with_prefix(rpc_client)
    .await?
    .into_iter()
    .map(|(pubkey, account)| {
      let mut data = account.data.as_slice();
      let sub_dao_epoch_info = SubDaoEpochInfoV0::try_deserialize(&mut data)?;
      Ok((pubkey, sub_dao_epoch_info))
    })
    .collect()
}

impl EpochInfo {
  pub async fn run(self, rpc_client: RpcClient, _solana_url: String) -> MyResult {
    get_accounts_with_prefix(&rpc_client).await?;
    Ok(())
  }
}

#[derive(Debug)]
pub struct SubDaoEpochInfo {
  pub epoch: u64,
  pub sub_dao: Pubkey,
  pub dc_burned: u64,
  pub vehnt_at_epoch_start: u64,

  pub vehnt_in_closing_positions: u128,
  /// The vehnt amount that is decaying per second, with 12 decimals of extra precision. Associated with positions that are closing this epoch,
  /// which means they must be subtracted from the total fall rate on the subdao after this epoch passes
  pub fall_rates_from_closing_positions: u128,
  /// The number of delegation rewards issued this epoch, so that delegators can claim their share of the rewards
  pub delegation_rewards_issued: u64,
  /// Precise number with 12 decimals
  pub utility_score: Option<u128>,
  /// The program only needs to know whether or not rewards were issued, however having a history of when they were issued could prove
  /// useful in the future, or at least for debugging purposes
  pub rewards_issued_at: Option<i64>,
  pub bump_seed: u8,
  pub initialized: bool,
}

impl TryFrom<SubDaoEpochInfoV0> for SubDaoEpochInfo {
  type Error = super::error::Error;
  fn try_from(value: SubDaoEpochInfoV0) -> Result<Self, Self::Error> {
    Ok(Self {
      epoch: value.epoch,
      sub_dao: value.sub_dao,
      dc_burned: value.dc_burned,
      vehnt_at_epoch_start: value.vehnt_at_epoch_start,
      vehnt_in_closing_positions: value.vehnt_in_closing_positions,
      fall_rates_from_closing_positions: value.fall_rates_from_closing_positions,
      delegation_rewards_issued: value.delegation_rewards_issued,
      utility_score: value.utility_score,
      rewards_issued_at: value.rewards_issued_at,
      bump_seed: value.bump_seed,
      initialized: value.initialized,
    })
  }
}
