use anchor_lang::prelude::*;

use crate::{DaoV0, SubDaoV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct AdminSetDcOnboardingFeesPaidArgs {
  pub dc_onboarding_fees_paid: u64,
}

#[derive(Accounts)]
pub struct AdminSetDcOnboardingFeesPaid<'info> {
  #[account(
    has_one = authority,
  )]
  pub dao: Account<'info, DaoV0>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Account<'info, SubDaoV0>,
  pub authority: Signer<'info>,
}

pub fn handler(
  ctx: Context<AdminSetDcOnboardingFeesPaid>,
  args: AdminSetDcOnboardingFeesPaidArgs,
) -> Result<()> {
  ctx.accounts.sub_dao.dc_onboarding_fees_paid = args.dc_onboarding_fees_paid;
  Ok(())
}
