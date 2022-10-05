use crate::{
  error::ErrorCode,
  precise_number::{InnerUint, PreciseNumber},
  state::*,
  OrArithError,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Token, TokenAccount, Transfer};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueRewardsArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: IssueRewardsArgsV0)]
pub struct IssueRewardsV0<'info> {
  #[account()]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    has_one = treasury
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = dao,
    constraint = dao_epoch_info.num_utility_scores_calculated == dao.num_sub_daos @ ErrorCode::MissingUtilityScores,
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = dao_epoch_info.bump_seed,
    constraint = !dao_epoch_info.done_issuing_rewards
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    has_one = sub_dao,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = sub_dao_epoch_info.bump_seed,
    constraint = !sub_dao_epoch_info.rewards_issued
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = ["dao_treasury".as_bytes(), dao.key().as_ref()],
    bump = dao.treasury_bump_seed,
  )]
  pub dao_treasury: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub treasury: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
}

fn to_prec(n: Option<u128>) -> Option<PreciseNumber> {
  Some(PreciseNumber {
    value: InnerUint::from(n?),
  })
}

pub fn handler(ctx: Context<IssueRewardsV0>, _args: IssueRewardsArgsV0) -> Result<()> {
  let utility_score = to_prec(ctx.accounts.sub_dao_epoch_info.utility_score)
    .ok_or_else(|| error!(ErrorCode::NoUtilityScore))?;
  let total_utility_score = to_prec(Some(ctx.accounts.dao_epoch_info.total_utility_score))
    .ok_or_else(|| error!(ErrorCode::NoUtilityScore))?;

  let percent_share = utility_score
    .checked_div(&total_utility_score)
    .or_arith_error()?;
  let total_rewards =
    PreciseNumber::new(ctx.accounts.dao.reward_per_epoch.into()).or_arith_error()?;
  let rewards_prec = percent_share.checked_mul(&total_rewards).or_arith_error()?;
  let rewards_amount = rewards_prec
    .floor() // Ensure we never overspend the defined rewards
    .or_arith_error()?
    .to_imprecise()
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?
    .try_into()
    .unwrap();

  msg!(
    "Rewards amount: {} {} {} {}",
    rewards_amount,
    ctx.accounts.sub_dao_epoch_info.utility_score.unwrap(),
    ctx.accounts.dao_epoch_info.total_utility_score,
    ctx.accounts.dao.reward_per_epoch
  );

  transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.dao_treasury.to_account_info(),
        to: ctx.accounts.treasury.to_account_info(),
        authority: ctx.accounts.dao.to_account_info(),
      },
      &[&[
        b"dao",
        ctx.accounts.dao.mint.as_ref(),
        &[ctx.accounts.dao.bump_seed],
      ]],
    ),
    rewards_amount,
  )?;

  ctx.accounts.dao_epoch_info.num_rewards_issued += 1;
  ctx.accounts.sub_dao_epoch_info.rewards_issued = true;
  ctx.accounts.dao_epoch_info.done_issuing_rewards =
    ctx.accounts.dao.num_sub_daos == ctx.accounts.dao_epoch_info.num_rewards_issued;

  Ok(())
}
