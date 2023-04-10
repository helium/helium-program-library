use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use shared_utils::resize_to_fit;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetCurrentRewardsArgsV0 {
  pub oracle_index: u16,
  pub current_rewards: u64,
}

#[derive(Accounts)]
#[instruction(args: SetCurrentRewardsArgsV0)]
pub struct SetCurrentRewardsV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  #[account(
    constraint = args.oracle_index < lazy_distributor.oracles.len() as u16 @ ErrorCode::InvalidOracleIndex,
    constraint = oracle.key() == lazy_distributor.oracles[usize::try_from(args.oracle_index).unwrap()].oracle
  )]
  pub oracle: Signer<'info>,
  /// CHECK: Checked via constraint
  #[account(
    constraint = lazy_distributor.approver.map(|a| a == approver.key() && approver.is_signer).unwrap_or(true)
  )]
  pub approver: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SetCurrentRewardsV0>, args: SetCurrentRewardsArgsV0) -> Result<()> {
  if ctx.accounts.recipient.current_config_version != ctx.accounts.lazy_distributor.version {
    ctx.accounts.recipient.current_config_version = ctx.accounts.lazy_distributor.version;
    ctx.accounts.recipient.current_rewards =
      vec![None; ctx.accounts.lazy_distributor.oracles.len()];
  }

  ctx.accounts.recipient.current_rewards[usize::try_from(args.oracle_index).unwrap()] =
    Some(args.current_rewards);

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.recipient,
  )?;

  Ok(())
}
