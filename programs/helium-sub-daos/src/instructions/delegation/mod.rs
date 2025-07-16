pub mod change_delegation_v0;
pub mod claim_rewards_v0;
pub mod claim_rewards_v1;
pub mod close_delegation_v0;
pub mod delegate_v0;
pub mod extend_expiration_ts_v0;
pub mod reset_lockup_v0;
pub mod temp_claim_buggy_rewards;
pub mod track_vote_v0;
pub mod transfer_v0;

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
pub use change_delegation_v0::*;
pub use claim_rewards_v0::*;
pub use claim_rewards_v1::*;
pub use close_delegation_v0::*;
pub use delegate_v0::*;
pub use extend_expiration_ts_v0::*;
use modular_governance::nft_proxy::accounts::ProxyConfigV0;
pub use reset_lockup_v0::*;
pub use temp_claim_buggy_rewards::*;
pub use track_vote_v0::*;
pub use transfer_v0::*;
use voter_stake_registry::state::{PositionV0, Registrar};

use crate::state::*;

pub struct DelegationBumps {
  pub sub_dao_epoch_info: u8,
  pub closing_time_sub_dao_epoch_info: u8,
  pub genesis_end_sub_dao_epoch_info: u8,
  pub delegated_position: u8,
}

pub struct DelegationAccounts<'a, 'info> {
  pub payer: &'a mut Signer<'info>,
  pub mint: &'a mut Box<Account<'info, Mint>>,
  pub position: &'a mut Box<Account<'info, PositionV0>>,
  pub registrar: &'a mut Box<Account<'info, Registrar>>,
  pub sub_dao: &'a mut Box<Account<'info, SubDaoV0>>,
  pub delegated_position: &'a mut Box<Account<'info, DelegatedPositionV0>>,
  pub sub_dao_epoch_info: &'a mut Box<Account<'info, SubDaoEpochInfoV0>>,
  pub closing_time_sub_dao_epoch_info: &'a mut Box<Account<'info, SubDaoEpochInfoV0>>,
  /// CHECK: This account can be uninitialized and will be initialized in delegate_helper if needed
  pub genesis_end_sub_dao_epoch_info: &'a AccountInfo<'info>,
  pub system_program: &'a mut Program<'info, System>,
  pub proxy_config: &'a mut Account<'info, ProxyConfigV0>,
}

pub struct CloseDelegationAccounts<'a, 'info> {
  pub position: &'a mut Box<Account<'info, PositionV0>>,
  pub registrar: &'a mut Box<Account<'info, Registrar>>,
  pub sub_dao: &'a mut Box<Account<'info, SubDaoV0>>,
  pub delegated_position: &'a mut Box<Account<'info, DelegatedPositionV0>>,
  pub sub_dao_epoch_info: &'a mut Box<Account<'info, SubDaoEpochInfoV0>>,
  pub closing_time_sub_dao_epoch_info: &'a mut Box<Account<'info, SubDaoEpochInfoV0>>,
  pub genesis_end_sub_dao_epoch_info: &'a mut Box<Account<'info, SubDaoEpochInfoV0>>,
}
