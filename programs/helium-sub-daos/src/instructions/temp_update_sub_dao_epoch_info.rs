use std::str::FromStr;

use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempUpdateSubDaoEpochInfoArgs {
  pub vehnt_in_closing_positions: Option<u128>,
  pub fall_rates_from_closing_positions: Option<u128>,
}

const FIX_DEPLOYER_KEY: &str = "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW";
#[derive(Accounts)]
#[instruction(args: TempUpdateSubDaoEpochInfoArgs)]
pub struct TempUpdateSubDaoEpochInfo<'info> {
  #[account(mut)]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    constraint = authority.key() == Pubkey::from_str(FIX_DEPLOYER_KEY).unwrap(),
  )]
  pub authority: Signer<'info>,
}

pub fn handler(
  ctx: Context<TempUpdateSubDaoEpochInfo>,
  args: TempUpdateSubDaoEpochInfoArgs,
) -> Result<()> {
  if let Some(vehnt_in_closing_positions) = args.vehnt_in_closing_positions {
    ctx.accounts.sub_dao_epoch_info.vehnt_in_closing_positions = vehnt_in_closing_positions;
  }

  if let Some(fall_rates_from_closing_positions) = args.fall_rates_from_closing_positions {
    ctx
      .accounts
      .sub_dao_epoch_info
      .fall_rates_from_closing_positions = fall_rates_from_closing_positions;
  }

  Ok(())
}
