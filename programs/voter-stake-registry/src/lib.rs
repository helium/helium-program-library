use anchor_lang::prelude::*;
pub use instructions::*;

pub mod error;
pub mod governance;
pub mod instructions;
pub mod state;
pub mod util;

// The program address.
declare_id!("hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8");

#[derive(Clone)]
pub struct VoterStakeRegistry;

impl anchor_lang::Id for VoterStakeRegistry {
  fn id() -> Pubkey {
    crate::id()
  }
}

// # Introduction
//
// The governance registry is an "addin" to the SPL governance program that
// allows one to both vote with many different ypes of tokens for voting and to
// scale voting power as a linear function of time locked--subject to some
// maximum upper bound.
//
// The flow for voting with this program is as follows:
//
// - Create a SPL governance realm.
// - Create a governance registry account.
// - Add exchange rates for any tokens one wants to deposit. For example,
//   if one wants to vote with tokens A and B, where token B has twice the
//   voting power of token A, then the exchange rate of B would be 2 and the
//   exchange rate of A would be 1.
// - Create a voter account.
// - Deposit tokens into this program, with an optional lockup period.
// - Vote.
//
// Upon voting with SPL governance, a client is expected to call
// `decay_voting_power` to get an up to date measurement of a given `Voter`'s
// voting power for the given slot. If this is not done, then the transaction
// will fail (since the SPL governance program will require the measurement
// to be active for the current slot).
//
// # Interacting with SPL Governance
//
// This program does not directly interact with SPL governance via CPI.
// Instead, it simply writes a `VoterWeightRecord` account with a well defined
// format, which is then used by SPL governance as the voting power measurement
// for a given user.
//
// # Max Vote Weight
//
// Given that one can use multiple tokens to vote, the max vote weight needs
// to be a function of the total supply of all tokens, converted into a common
// currency. For example, if you have Token A and Token B, where 1 Token B =
// 10 Token A, then the `max_vote_weight` should be `supply(A) + supply(B)*10`
// where both are converted into common decimals. Then, when calculating the
// weight of an individual voter, one can convert B into A via the given
// exchange rate, which must be fixed.
//
// Note that the above also implies that the `max_vote_weight` must fit into
// a u64.
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

  pub fn cast_vote_v0<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, CastVoteV0<'info>>,
    args: CastVoteArgsV0,
  ) -> Result<()> {
    instructions::cast_vote_v0::handler(ctx, args)
  }

  pub fn relinquish_vote_v0(ctx: Context<RelinquishVoteV0>) -> Result<()> {
    instructions::relinquish_vote_v0::handler(ctx)
  }
}
