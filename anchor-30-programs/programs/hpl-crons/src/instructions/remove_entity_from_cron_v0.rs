use anchor_lang::prelude::*;
use tuktuk_program::cron::{
  accounts::CronJobV0,
  cpi::{accounts::RemoveCronTransactionV0, remove_cron_transaction_v0},
  program::Cron,
  types::RemoveCronTransactionArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RemoveEntityFromCronArgsV0 {
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: RemoveEntityFromCronArgsV0)]
pub struct RemoveEntityFromCronV0<'info> {
  #[account(mut)]
  /// CHECK: Just receiving rent refund
  pub rent_refund: AccountInfo<'info>,
  pub user_authority: Signer<'info>,
  #[account(
    seeds = [b"entity_cron_authority", user_authority.key().as_ref()],
    bump,
  )]
  /// CHECK: By seeds
  pub authority: AccountInfo<'info>,
  #[account(mut, has_one = authority)]
  pub cron_job: Box<Account<'info, CronJobV0>>,
  #[account(mut)]
  /// CHECK: Via CPI
  pub cron_job_transaction: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub cron_program: Program<'info, Cron>,
}

pub fn handler(
  ctx: Context<RemoveEntityFromCronV0>,
  args: RemoveEntityFromCronArgsV0,
) -> Result<()> {
  remove_cron_transaction_v0(
    CpiContext::new_with_signer(
      ctx.accounts.cron_program.to_account_info(),
      RemoveCronTransactionV0 {
        rent_refund: ctx.accounts.rent_refund.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        cron_job: ctx.accounts.cron_job.to_account_info(),
        cron_job_transaction: ctx.accounts.cron_job_transaction.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&[
        b"entity_cron_authority",
        ctx.accounts.user_authority.key().as_ref(),
        &[ctx.bumps.authority],
      ]],
    ),
    RemoveCronTransactionArgsV0 { index: args.index },
  )?;
  Ok(())
}
