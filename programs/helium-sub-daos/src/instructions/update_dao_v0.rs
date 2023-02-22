use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateDaoArgsV0 {
  pub authority: Option<Pubkey>,
  pub emission_schedule: Option<Vec<EmissionScheduleItem>>,
  pub hst_emission_schedule: Option<Vec<PercentItem>>,
}

#[derive(Accounts)]
#[instruction(args: UpdateDaoArgsV0)]
pub struct UpdateDaoV0<'info> {
  #[account(
    mut,
    seeds = ["dao".as_bytes(), dao.hnt_mint.key().as_ref()],
    bump = dao.bump_seed,
    has_one = authority,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateDaoV0>, args: UpdateDaoArgsV0) -> Result<()> {
  if let Some(new_authority) = args.authority {
    ctx.accounts.dao.authority = new_authority;
  }

  if let Some(emission_schedule) = args.emission_schedule {
    ctx.accounts.dao.emission_schedule = emission_schedule;
  }

  if let Some(hst_emission_schedule) = args.hst_emission_schedule {
    ctx.accounts.dao.hst_emission_schedule = hst_emission_schedule;
  }

  Ok(())
}
