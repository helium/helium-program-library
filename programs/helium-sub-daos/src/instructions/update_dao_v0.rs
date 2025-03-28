use anchor_lang::prelude::*;
use shared_utils::resize_to_fit;

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateDaoArgsV0 {
  pub authority: Option<Pubkey>,
  pub emission_schedule: Option<Vec<EmissionScheduleItem>>,
  pub hst_emission_schedule: Option<Vec<PercentItem>>,
  pub hst_pool: Option<Pubkey>,
  pub net_emissions_cap: Option<u64>,
  pub proposal_namespace: Option<Pubkey>,
  pub delegator_rewards_percent: Option<u64>,
  pub rewards_escrow: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateDaoArgsV0)]
pub struct UpdateDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    seeds = ["dao".as_bytes(), dao.hnt_mint.key().as_ref()],
    bump = dao.bump_seed,
    has_one = authority,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateDaoV0>, args: UpdateDaoArgsV0) -> Result<()> {
  let mut should_resize = false;
  if let Some(new_authority) = args.authority {
    ctx.accounts.dao.authority = new_authority;
  }

  if let Some(rewards_escrow) = args.rewards_escrow {
    ctx.accounts.dao.rewards_escrow = rewards_escrow;
  }

  if let Some(hst_emission_schedule) = args.hst_emission_schedule {
    ctx.accounts.dao.hst_emission_schedule = hst_emission_schedule;
    should_resize = true;
  }

  if let Some(net_emissions_cap) = args.net_emissions_cap {
    ctx.accounts.dao.net_emissions_cap = net_emissions_cap;
  }

  if let Some(emission_schedule) = args.emission_schedule {
    ctx.accounts.dao.emission_schedule = emission_schedule;
    should_resize = true;
  }

  if let Some(hst_pool) = args.hst_pool {
    ctx.accounts.dao.hst_pool = hst_pool;
  }

  if let Some(proposal_namespace) = args.proposal_namespace {
    ctx.accounts.dao.proposal_namespace = proposal_namespace;
  }

  if let Some(delegator_rewards_percent) = args.delegator_rewards_percent {
    require_gte!(
      100_u64.checked_mul(10_0000000).unwrap(),
      delegator_rewards_percent,
    );
    ctx.accounts.dao.delegator_rewards_percent = delegator_rewards_percent;
  }

  if should_resize {
    resize_to_fit(
      &ctx.accounts.payer.to_account_info(),
      &ctx.accounts.system_program.to_account_info(),
      &ctx.accounts.dao,
    )?;
  }

  Ok(())
}
