use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateSubDaoVeHntArgsV0 {
  pub vehnt_delegated: Option<u128>,
  pub vehnt_last_calculated_ts: Option<i64>,
  pub vehnt_fall_rate: Option<u128>,
}

#[derive(Accounts)]
#[instruction(args: UpdateSubDaoVeHntArgsV0)]
pub struct UpdateSubDaoVeHntV0<'info> {
  #[account(
    mut,
    seeds = ["sub_dao".as_bytes(), sub_dao.dnt_mint.key().as_ref()],
    bump = sub_dao.bump_seed,
    has_one = authority,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateSubDaoVeHntV0>, args: UpdateSubDaoVeHntArgsV0) -> Result<()> {
  if let Some(vehnt_delegated) = args.vehnt_delegated {
    ctx.accounts.sub_dao.vehnt_delegated = vehnt_delegated;
  }

  if let Some(vehnt_last_calculated_ts) = args.vehnt_last_calculated_ts {
    ctx.accounts.sub_dao.vehnt_last_calculated_ts = vehnt_last_calculated_ts;
  }

  if let Some(vehnt_fall_rate) = args.vehnt_fall_rate {
    ctx.accounts.sub_dao.vehnt_fall_rate = vehnt_fall_rate;
  }

  Ok(())
}
