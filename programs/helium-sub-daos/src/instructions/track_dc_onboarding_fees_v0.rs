use anchor_lang::prelude::*;

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TrackDcOnboardingFeesArgsV0 {
  pub amount: u64,
  pub add: bool,
  pub symbol: String,
}

pub const HEM_ID: Pubkey = pubkey!("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8");

#[derive(Accounts)]
#[instruction(args: TrackDcOnboardingFeesArgsV0)]
pub struct TrackDcOnboardingFeesV0<'info> {
  #[account(
    seeds = [
      "rewardable_entity_config".as_bytes(),
      sub_dao.key().as_ref(),
      args.symbol.as_bytes()
    ],
    bump,
    seeds::program = HEM_ID,
  )]
  pub hem_auth: Signer<'info>,
  #[account(mut)]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
}

pub fn handler(
  ctx: Context<TrackDcOnboardingFeesV0>,
  args: TrackDcOnboardingFeesArgsV0,
) -> Result<()> {
  if args.add {
    ctx.accounts.sub_dao.dc_onboarding_fees_paid = ctx
      .accounts
      .sub_dao
      .dc_onboarding_fees_paid
      .checked_add(args.amount)
      .unwrap();
  } else {
    ctx.accounts.sub_dao.dc_onboarding_fees_paid = ctx
      .accounts
      .sub_dao
      .dc_onboarding_fees_paid
      .checked_sub(args.amount)
      .unwrap();
  }

  Ok(())
}
