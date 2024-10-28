use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};
use position_voting_rewards::{
  cpi::{accounts::RewardForEpochV0, reward_for_epoch_v0},
  instructions::RewardForEpochArgsV0,
  program::PositionVotingRewards,
  state::{VeTokenTrackerV0, VsrEpochInfoV0},
};
use voter_stake_registry::state::Registrar;

use crate::{
  current_epoch, error::ErrorCode, sub_dao_seeds, GetEmissions, SubDaoV0, EPOCH_LENGTH, TESTING,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct IssueVotingRewardsArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: IssueVotingRewardsArgsV0)]
pub struct IssueVotingRewardsV0<'info> {
  #[account(
    has_one = registrar,
    has_one = vetoken_tracker,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(mut)]
  pub rent_payer: Signer<'info>,
  #[account(
    has_one = rewards_mint,
    has_one = registrar,
  )]
  pub vetoken_tracker: Box<Account<'info, VeTokenTrackerV0>>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    mut,
    seeds = ["vsr_epoch_info".as_bytes(), vetoken_tracker.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
    seeds::program = position_voting_rewards,
  )]
  /// CHECK: Checked by seeds
  pub vsr_epoch_info: UncheckedAccount<'info>,
  #[account(mut)]
  pub rewards_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = rent_payer,
    associated_token::mint = rewards_mint,
    associated_token::authority = vsr_epoch_info,
  )]
  pub rewards_pool: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = rent_payer,
    associated_token::mint = rewards_mint,
    associated_token::authority = sub_dao,
  )]
  pub payer_ata: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), rewards_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = rewards_mint_circuit_breaker.bump_seed
  )]
  pub rewards_mint_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub position_voting_rewards: Program<'info, PositionVotingRewards>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<IssueVotingRewardsV0>, args: IssueVotingRewardsArgsV0) -> Result<()> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch_curr_ts = current_epoch(curr_ts);
  let end_of_epoch_ts = i64::try_from(args.epoch + 1).unwrap() * EPOCH_LENGTH;

  if !TESTING && args.epoch >= epoch_curr_ts {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  let data: &mut [u8] = &mut ctx.accounts.vsr_epoch_info.try_borrow_mut_data()?;
  if !data.is_empty() {
    let vsr_epoch_info: VsrEpochInfoV0 = anchor_lang::AnchorDeserialize::deserialize(&mut &*data)?;
    if vsr_epoch_info.rewards_issued_at.is_some() {
      return Err(error!(ErrorCode::RewardsAlreadyIssued));
    }
  }
  drop(data);

  let total_emissions = ctx
    .accounts
    .sub_dao
    .emission_schedule
    .get_emissions_at(end_of_epoch_ts)
    .unwrap();
  let max_percent = 100_u64.checked_mul(10_0000000).unwrap();
  let amount = (total_emissions as u128)
    .checked_mul(u128::from(ctx.accounts.sub_dao.voting_rewards_percent))
    .unwrap()
    .checked_div(max_percent as u128) // 100% with 2 decimals accuracy
    .unwrap()
    .try_into()
    .unwrap();

  mint_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      MintV0 {
        mint: ctx.accounts.rewards_mint.to_account_info(),
        to: ctx.accounts.payer_ata.to_account_info(),
        mint_authority: ctx.accounts.sub_dao.to_account_info(),
        circuit_breaker: ctx.accounts.rewards_mint_circuit_breaker.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
      },
      &[sub_dao_seeds!(ctx.accounts.sub_dao)],
    ),
    MintArgsV0 { amount },
  )?;

  reward_for_epoch_v0(
    CpiContext::new_with_signer(
      ctx.accounts.position_voting_rewards.to_account_info(),
      RewardForEpochV0 {
        rewards_authority: ctx.accounts.sub_dao.to_account_info(),
        rewards_payer: ctx.accounts.sub_dao.to_account_info(),
        rent_payer: ctx.accounts.rent_payer.to_account_info(),
        vetoken_tracker: ctx.accounts.vetoken_tracker.to_account_info(),
        registrar: ctx.accounts.registrar.to_account_info(),
        vsr_epoch_info: ctx.accounts.vsr_epoch_info.to_account_info(),
        rewards_mint: ctx.accounts.rewards_mint.to_account_info(),
        rewards_pool: ctx.accounts.rewards_pool.to_account_info(),
        payer_ata: ctx.accounts.payer_ata.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
      },
      &[sub_dao_seeds!(ctx.accounts.sub_dao)],
    ),
    RewardForEpochArgsV0 {
      epoch: args.epoch,
      amount,
    },
  )?;

  Ok(())
}
