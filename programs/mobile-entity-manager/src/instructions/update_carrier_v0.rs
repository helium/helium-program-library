use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateCarrierArgsV0 {
  pub update_authority: Option<Pubkey>,
  pub issuing_authority: Option<Pubkey>,
  pub hexboost_authority: Option<Pubkey>,
  pub incentive_escrow_fund_bps: Option<u16>,
}

#[derive(Accounts)]
#[instruction(args: UpdateCarrierArgsV0)]
pub struct UpdateCarrierV0<'info> {
  #[account(
    mut,
    has_one = update_authority
  )]
  pub carrier: Box<Account<'info, CarrierV0>>,
  #[account(mut)]
  pub update_authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateCarrierV0>, args: UpdateCarrierArgsV0) -> Result<()> {
  if let Some(update_authority) = args.update_authority {
    ctx.accounts.carrier.update_authority = update_authority;
  }

  if let Some(hexboost_authority) = args.hexboost_authority {
    ctx.accounts.carrier.hexboost_authority = hexboost_authority;
  }

  if let Some(issuing_authority) = args.issuing_authority {
    ctx.accounts.carrier.issuing_authority = issuing_authority;
  }

  if let Some(incentive_escrow_fund_bps) = args.incentive_escrow_fund_bps {
    require_gte!(
      10000, // 10,000 basis points is 100 percent
      incentive_escrow_fund_bps,
      ErrorCode::InvalidIncentiveEscrowFundBps
    );
    ctx.accounts.carrier.incentive_escrow_fund_bps = incentive_escrow_fund_bps;
  }

  Ok(())
}
