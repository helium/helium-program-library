use anchor_lang::prelude::*;

use crate::{DaoV0, SubDaoEpochInfoV0, SubDaoV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct AdminSetDcOnboardingFeesPaidEpochInfoArgs {
  pub dc_onboarding_fees_paid: u64,
}

#[derive(Accounts)]
pub struct AdminSetDcOnboardingFeesPaidEpochInfo<'info> {
  #[account(
    has_one = authority,
  )]
  pub dao: Account<'info, DaoV0>,
  #[account(
    has_one = dao,
  )]
  pub sub_dao: Account<'info, SubDaoV0>,
  #[account(
    has_one = sub_dao
  )]
  pub sub_dao_epoch_info: Account<'info, SubDaoEpochInfoV0>,
  pub authority: Signer<'info>,
}

pub fn handler(
  ctx: Context<AdminSetDcOnboardingFeesPaidEpochInfo>,
  args: AdminSetDcOnboardingFeesPaidEpochInfoArgs,
) -> Result<()> {
  ctx.accounts.sub_dao_epoch_info.dc_onboarding_fees_paid = args.dc_onboarding_fees_paid;
  Ok(())
}
