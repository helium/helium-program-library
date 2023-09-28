use crate::state::*;
use anchor_lang::prelude::*;
use shared_utils::resize_to_fit;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateRewardableEntityConfigArgsV0 {
  pub new_authority: Option<Pubkey>,
  pub settings: Option<ConfigSettingsV0>,
  pub staking_requirement: Option<u64>,
}

#[derive(Accounts)]
#[instruction(args: UpdateRewardableEntityConfigArgsV0)]
pub struct UpdateRewardableEntityConfigV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority,
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<UpdateRewardableEntityConfigV0>,
  args: UpdateRewardableEntityConfigArgsV0,
) -> Result<()> {
  let config = &mut ctx.accounts.rewardable_entity_config;
  if let Some(new_authority) = args.new_authority {
    config.authority = new_authority;
  }

  if let Some(settings) = args.settings {
    config.settings = settings;
  }

  if let Some(staking_requirement) = args.staking_requirement {
    config.staking_requirement = staking_requirement;
  }

  resize_to_fit(
    &ctx.accounts.payer,
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.rewardable_entity_config,
  )?;

  Ok(())
}
