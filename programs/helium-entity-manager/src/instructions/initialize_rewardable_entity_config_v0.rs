use crate::error::ErrorCode;
use crate::{state::*, TESTING};
use anchor_lang::prelude::*;
use helium_sub_daos::SubDaoV0;
use shared_utils::resize_to_fit;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeRewardableEntityConfigArgsV0 {
  pub symbol: String,
  pub settings: ConfigSettingsV0,
  pub staking_requirement: u64,
}

#[derive(Accounts)]
#[instruction(args: InitializeRewardableEntityConfigArgsV0)]
pub struct InitializeRewardableEntityConfigV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
    has_one = authority
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,

  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<RewardableEntityConfigV0>(),
    seeds = ["rewardable_entity_config".as_bytes(), sub_dao.key().as_ref(), args.symbol.as_bytes()],
    bump,
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeRewardableEntityConfigV0>,
  args: InitializeRewardableEntityConfigArgsV0,
) -> Result<()> {
  require!(args.symbol.len() <= 10, ErrorCode::InvalidStringLength);
  require!(
    args.symbol == "IOT" || args.symbol == "MOBILE" || TESTING,
    ErrorCode::InvalidSymbol
  );

  ctx
    .accounts
    .rewardable_entity_config
    .set_inner(RewardableEntityConfigV0 {
      sub_dao: ctx.accounts.sub_dao.key(),
      symbol: args.symbol.clone(),
      authority: ctx.accounts.authority.key(),
      bump_seed: ctx.bumps["rewardable_entity_config"],
      settings: args.settings,
      staking_requirement: args.staking_requirement,
    });

  resize_to_fit(
    &ctx.accounts.payer,
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.rewardable_entity_config,
  )?;

  Ok(())
}
