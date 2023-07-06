use crate::state::*;
use anchor_lang::prelude::*;
use helium_sub_daos::DaoV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ApproveProgramArgsV0 {
  pub program_id: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: ApproveProgramArgsV0)]
pub struct ApproveProgramV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
    has_one = authority
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,

  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<ProgramApprovalV0>(),
    seeds = ["program_approval".as_bytes(), dao.key().as_ref(), args.program_id.as_ref()],
    bump,
  )]
  pub program_approval: Box<Account<'info, ProgramApprovalV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ApproveProgramV0>, args: ApproveProgramArgsV0) -> Result<()> {
  ctx.accounts.program_approval.set_inner(ProgramApprovalV0 {
    dao: ctx.accounts.dao.key(),
    program_id: args.program_id,
    bump_seed: ctx.bumps["program_approval"],
    approved_merkle_trees: Vec::new(),
  });

  Ok(())
}
