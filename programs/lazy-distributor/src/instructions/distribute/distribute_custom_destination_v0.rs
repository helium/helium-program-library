use super::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct DistributeCustomDestinationV0<'info> {
  pub common: DistributeRewardsCommonV0<'info>,
}

pub fn handler(ctx: Context<DistributeCustomDestinationV0>) -> Result<()> {
  require_eq!(
    ctx.accounts.common.owner.key(),
    ctx.accounts.common.recipient.destination
  );
  require_neq!(ctx.accounts.common.recipient.destination, Pubkey::default());

  distribute_impl(&mut ctx.accounts.common)
}
