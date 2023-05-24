use crate::state::*;
use anchor_lang::prelude::*;
use helium_sub_daos::SubDaoV0;

#[derive(Accounts)]
pub struct ApproveCarrierV0<'info> {
  #[account(
    has_one = authority
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,

  #[account(
    mut,
    has_one = sub_dao
  )]
  pub carrier: Box<Account<'info, CarrierV0>>,
}

pub fn handler(ctx: Context<ApproveCarrierV0>) -> Result<()> {
  ctx.accounts.carrier.approved = true;

  Ok(())
}
