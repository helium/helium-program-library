use crate::state::*;
use crate::utils::resize_to_fit;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetRewardsV0Args {
  pub oracle_index: usize,
  pub current_rewards: u64,
}

#[derive(Accounts)]
#[instruction(args: SetRewardsV0Args)]
pub struct SetRewardsV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  #[account(
    constraint = oracle.key() == lazy_distributor.oracles[args.oracle_index].oracle
  )]
  pub oracle: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SetRewardsV0>, args: SetRewardsV0Args) -> Result<()> {
  if ctx.accounts.recipient.current_config_version != ctx.accounts.lazy_distributor.version {
    ctx.accounts.recipient.current_config_version = ctx.accounts.lazy_distributor.version;
    ctx.accounts.recipient.current_rewards =
      vec![None; ctx.accounts.lazy_distributor.oracles.len()];
  }

  ctx.accounts.recipient.current_rewards[args.oracle_index] = Some(args.current_rewards);

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.recipient,
  )?;

  Ok(())
}
