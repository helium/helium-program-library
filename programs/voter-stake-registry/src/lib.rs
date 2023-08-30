use anchor_lang::prelude::*;
pub use instructions::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

pub mod error;
pub mod governance;
pub mod instructions;
pub mod state;
pub mod util;

// The program address.
declare_id!("hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Voter Stake Registry",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/voter-stake-registry",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[derive(Clone)]
pub struct VoterStakeRegistry;

impl anchor_lang::Id for VoterStakeRegistry {
  fn id() -> Pubkey {
    crate::id()
  }
}

#[program]
pub mod voter_stake_registry {
  use super::*;

  pub fn initialize_registrar_v0(
    ctx: Context<InitializeRegistrarV0>,
    args: InitializeRegistrarArgsV0,
  ) -> Result<()> {
    instructions::initialize_registrar_v0::handler(ctx, args)
  }

  pub fn configure_voting_mint_v0(
    ctx: Context<ConfigureVotingMintV0>,
    args: ConfigureVotingMintArgsV0,
  ) -> Result<()> {
    instructions::configure_voting_mint_v0::handler(ctx, args)
  }

  pub fn update_max_voter_weight_v0(ctx: Context<UpdateMaxVoterWeightV0>) -> Result<()> {
    instructions::update_max_voter_weight_v0::handler(ctx)
  }

  pub fn initialize_position_v0(
    ctx: Context<InitializePositionV0>,
    args: InitializePositionArgsV0,
  ) -> Result<()> {
    instructions::initialize_position_v0::handler(ctx, args)
  }

  pub fn deposit_v0(ctx: Context<DepositV0>, args: DepositArgsV0) -> Result<()> {
    instructions::deposit_v0::handler(ctx, args)
  }

  pub fn withdraw_v0(ctx: Context<WithdrawV0>, args: WithdrawArgsV0) -> Result<()> {
    instructions::withdraw_v0::handler(ctx, args)
  }

  pub fn close_position_v0(ctx: Context<ClosePositionV0>) -> Result<()> {
    instructions::close_position_v0::handler(ctx)
  }

  pub fn reset_lockup_v0(ctx: Context<ResetLockupV0>, args: ResetLockupArgsV0) -> Result<()> {
    instructions::reset_lockup_v0::handler(ctx, args)
  }

  pub fn transfer_v0(ctx: Context<TransferV0>, args: TransferArgsV0) -> Result<()> {
    instructions::transfer_v0::handler(ctx, args)
  }

  pub fn update_voter_weight_record_v0(
    ctx: Context<UpdateVoterWeightRecordV0>,
    args: UpdateVoterWeightRecordArgsV0,
  ) -> Result<()> {
    instructions::update_voter_weight_record_v0::handler(ctx, args)
  }

  pub fn set_time_offset_v0(ctx: Context<SetTimeOffsetV0>, time_offset: i64) -> Result<()> {
    instructions::set_time_offset_v0::handler(ctx, time_offset)
  }

  pub fn cast_vote_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, CastVoteV0<'info>>,
    args: CastVoteArgsV0,
  ) -> Result<()> {
    instructions::cast_vote_v0::handler(ctx, args)
  }

  pub fn relinquish_vote_v0(ctx: Context<RelinquishVoteV0>) -> Result<()> {
    instructions::relinquish_vote_v0::handler(ctx)
  }

  pub fn ledger_transfer_position_v0(ctx: Context<LedgerTransferPositionV0>) -> Result<()> {
    instructions::ledger_transfer_position_v0::handler(ctx)
  }

  pub fn update_registrar_authority_v0(ctx: Context<UpdateRegistrarAuthorityV0>) -> Result<()> {
    instructions::update_registrar_authority_v0::handler(ctx)
  }

  pub fn vote_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, VoteV0<'info>>,
    args: VoteArgsV0,
  ) -> Result<()> {
    instructions::vote_v0::handler(ctx, args)
  }

  pub fn relinquish_vote_v1(
    ctx: Context<RelinquishVoteV1>,
    args: RelinquishVoteArgsV1,
  ) -> Result<()> {
    instructions::relinquish_vote_v1::handler(ctx, args)
  }
}
