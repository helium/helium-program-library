use anchor_lang::prelude::*;
use instructions::*;
use state::*;

mod error;
pub mod events;
mod governance;
mod instructions;
pub mod state;

// The program address.
declare_id!("hvsrY9UBtHhYRvstM2BWCsni81kevfn7B2DEhYbGA1a");

/// # Introduction
///
/// The governance registry is an "addin" to the SPL governance program that
/// allows one to both vote with many different ypes of tokens for voting and to
/// scale voting power as a linear function of time locked--subject to some
/// maximum upper bound.
///
/// The flow for voting with this program is as follows:
///
/// - Create a SPL governance realm.
/// - Create a governance registry account.
/// - Add exchange rates for any tokens one wants to deposit. For example,
///   if one wants to vote with tokens A and B, where token B has twice the
///   voting power of token A, then the exchange rate of B would be 2 and the
///   exchange rate of A would be 1.
/// - Create a voter account.
/// - Deposit tokens into this program, with an optional lockup period.
/// - Vote.
///
/// Upon voting with SPL governance, a client is expected to call
/// `decay_voting_power` to get an up to date measurement of a given `Voter`'s
/// voting power for the given slot. If this is not done, then the transaction
/// will fail (since the SPL governance program will require the measurement
/// to be active for the current slot).
///
/// # Interacting with SPL Governance
///
/// This program does not directly interact with SPL governance via CPI.
/// Instead, it simply writes a `VoterWeightRecord` account with a well defined
/// format, which is then used by SPL governance as the voting power measurement
/// for a given user.
///
/// # Max Vote Weight
///
/// Given that one can use multiple tokens to vote, the max vote weight needs
/// to be a function of the total supply of all tokens, converted into a common
/// currency. For example, if you have Token A and Token B, where 1 Token B =
/// 10 Token A, then the `max_vote_weight` should be `supply(A) + supply(B)*10`
/// where both are converted into common decimals. Then, when calculating the
/// weight of an individual voter, one can convert B into A via the given
/// exchange rate, which must be fixed.
///
/// Note that the above also implies that the `max_vote_weight` must fit into
/// a u64.
#[program]
pub mod voter_stake_registry {
  use super::*;

  pub fn create_registrar(ctx: Context<CreateRegistrar>) -> Result<()> {
    instructions::create_registrar(ctx)
  }

  pub fn configure_voting_mint(
    ctx: Context<ConfigureVotingMint>,
    idx: u16,
    digit_shift: i8,
    locked_vote_weight_scaled_factor: u64,
    minimum_required_lockup_secs: u64,
    max_extra_lockup_vote_weight_scaled_factor: u64,
    genesis_vote_power_multiplier: u8,
    genesis_vote_power_multiplier_expiration_ts: i64,
    lockup_saturation_secs: u64,
    grant_authority: Option<Pubkey>,
  ) -> Result<()> {
    instructions::configure_voting_mint(
      ctx,
      idx,
      digit_shift,
      locked_vote_weight_scaled_factor,
      minimum_required_lockup_secs,
      max_extra_lockup_vote_weight_scaled_factor,
      genesis_vote_power_multiplier,
      genesis_vote_power_multiplier_expiration_ts,
      lockup_saturation_secs,
      grant_authority,
    )
  }

  pub fn create_voter(ctx: Context<CreateVoter>) -> Result<()> {
    instructions::create_voter(ctx)
  }

  pub fn create_deposit_entry(
    ctx: Context<CreateDepositEntry>,
    deposit_entry_index: u8,
    kind: LockupKind,
    start_ts: Option<u64>,
    periods: u32,
  ) -> Result<()> {
    instructions::create_deposit_entry(ctx, deposit_entry_index, kind, start_ts, periods)
  }

  pub fn deposit(ctx: Context<Deposit>, deposit_entry_index: u8, amount: u64) -> Result<()> {
    instructions::deposit(ctx, deposit_entry_index, amount)
  }

  pub fn withdraw(ctx: Context<Withdraw>, deposit_entry_index: u8, amount: u64) -> Result<()> {
    instructions::withdraw(ctx, deposit_entry_index, amount)
  }

  pub fn close_deposit_entry(
    ctx: Context<CloseDepositEntry>,
    deposit_entry_index: u8,
  ) -> Result<()> {
    instructions::close_deposit_entry(ctx, deposit_entry_index)
  }

  pub fn reset_lockup(
    ctx: Context<ResetLockup>,
    deposit_entry_index: u8,
    kind: LockupKind,
    periods: u32,
  ) -> Result<()> {
    instructions::reset_lockup(ctx, deposit_entry_index, kind, periods)
  }

  pub fn internal_transfer_locked(
    ctx: Context<InternalTransferLocked>,
    source_deposit_entry_index: u8,
    target_deposit_entry_index: u8,
    amount: u64,
  ) -> Result<()> {
    instructions::internal_transfer_locked(
      ctx,
      source_deposit_entry_index,
      target_deposit_entry_index,
      amount,
    )
  }

  pub fn update_voter_weight_record(ctx: Context<UpdateVoterWeightRecord>) -> Result<()> {
    instructions::update_voter_weight_record(ctx)
  }

  pub fn update_max_vote_weight(ctx: Context<UpdateMaxVoteWeight>) -> Result<()> {
    instructions::update_max_vote_weight(ctx)
  }

  pub fn close_voter<'key, 'accounts, 'remaining, 'info>(
    ctx: Context<'key, 'accounts, 'remaining, 'info, CloseVoter<'info>>,
  ) -> Result<()> {
    instructions::close_voter(ctx)
  }

  pub fn log_voter_info(
    ctx: Context<LogVoterInfo>,
    deposit_entry_begin: u8,
    deposit_entry_count: u8,
  ) -> Result<()> {
    instructions::log_voter_info(ctx, deposit_entry_begin, deposit_entry_count)
  }

  pub fn set_time_offset(ctx: Context<SetTimeOffset>, time_offset: i64) -> Result<()> {
    instructions::set_time_offset(ctx, time_offset)
  }
}
