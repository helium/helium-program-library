use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RevokeMakerV0<'info> {
  #[account(mut)]
  pub refund: Signer<'info>,

  #[account(
    has_one = authority
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  pub authority: Signer<'info>,

  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    mut,
    close = refund,
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump = maker_approval.bump_seed,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<RevokeMakerV0>) -> Result<()> {
  Ok(())
}
