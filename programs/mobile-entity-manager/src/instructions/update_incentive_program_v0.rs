use anchor_lang::prelude::*;

use crate::{CarrierV0, IncentiveEscrowProgramV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateIncentiveProgramV0Args {
  pub start_ts: Option<i64>,
  pub stop_ts: Option<i64>,
  pub shares: Option<u32>,
}

#[derive(Accounts)]
pub struct UpdateIncentiveProgramV0<'info> {
  pub issuing_authority: Signer<'info>,
  #[account(has_one = issuing_authority)]
  pub carrier: Box<Account<'info, CarrierV0>>,
  #[account(mut, has_one = carrier)]
  pub incentive_escrow_program: Box<Account<'info, IncentiveEscrowProgramV0>>,
}

pub fn handler(
  ctx: Context<UpdateIncentiveProgramV0>,
  args: UpdateIncentiveProgramV0Args,
) -> Result<()> {
  if let Some(start_ts) = args.start_ts {
    ctx.accounts.incentive_escrow_program.start_ts = start_ts;
  }
  if let Some(stop_ts) = args.stop_ts {
    ctx.accounts.incentive_escrow_program.stop_ts = stop_ts;
  }
  if let Some(shares) = args.shares {
    ctx.accounts.incentive_escrow_program.shares = shares;
  }
  Ok(())
}
