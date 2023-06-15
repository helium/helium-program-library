use std::str::FromStr;

use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempUpdateSubDaoEpochInfoArgs {
  pub vehnt_in_closing_positions: Option<u128>,
  pub fall_rates_from_closing_positions: Option<u128>,
  pub epoch: u64,
}

const FIX_DEPLOYER_KEY: &str = "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW";
#[derive(Accounts)]
#[instruction(args: TempUpdateSubDaoEpochInfoArgs)]
pub struct TempUpdateSubDaoEpochInfo<'info> {
  #[account(
    init_if_needed,
    payer = authority,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub sub_dao: Account<'info, SubDaoV0>,
  #[account(
    mut,
    token::authority = &Pubkey::from_str(FIX_DEPLOYER_KEY).unwrap(),
  )]
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<TempUpdateSubDaoEpochInfo>,
  args: TempUpdateSubDaoEpochInfoArgs,
) -> Result<()> {
  if let Some(vehnt_in_closing_positions) = args.vehnt_in_closing_positions {
    ctx.accounts.sub_dao_epoch_info.vehnt_in_closing_positions = vehnt_in_closing_positions;
  }

  ctx.accounts.sub_dao_epoch_info.epoch = args.epoch;
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = ctx.bumps["sub_dao_epoch_info"];

  if let Some(fall_rates_from_closing_positions) = args.fall_rates_from_closing_positions {
    ctx
      .accounts
      .sub_dao_epoch_info
      .fall_rates_from_closing_positions = fall_rates_from_closing_positions;
  }

  Ok(())
}
