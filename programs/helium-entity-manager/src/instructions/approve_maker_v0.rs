use crate::state::*;
use anchor_lang::prelude::*;
use helium_sub_daos::SubDaoV0;

#[derive(Accounts)]
pub struct ApproveMakerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
    has_one = authority,
    has_one = sub_dao,
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    constraint = sub_dao.dao == maker.dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,

  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<MakerApprovalV0>(),
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ApproveMakerV0>) -> Result<()> {
  ctx.accounts.maker_approval.set_inner(MakerApprovalV0 {
    rewardable_entity_config: ctx.accounts.rewardable_entity_config.key(),
    maker: ctx.accounts.maker.key(),
    bump_seed: ctx.bumps["maker_approval"],
  });

  Ok(())
}
