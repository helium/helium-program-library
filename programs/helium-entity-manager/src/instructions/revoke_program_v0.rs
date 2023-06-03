use crate::state::*;
use anchor_lang::prelude::*;
use helium_sub_daos::DaoV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RevokeProgramArgsV0 {
  pub program_id: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: RevokeProgramArgsV0)]
pub struct RevokeProgramV0<'info> {
  #[account(mut)]
  pub refund: Signer<'info>,

  #[account(
    has_one = authority
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,

  #[account(
    mut,
    close = refund,
    seeds = ["program_approval".as_bytes(), dao.key().as_ref(), args.program_id.as_ref()],
    bump = program_approval.bump_seed,
  )]
  pub program_approval: Box<Account<'info, ProgramApprovalV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<RevokeProgramV0>, _args: RevokeProgramArgsV0) -> Result<()> {
  Ok(())
}
