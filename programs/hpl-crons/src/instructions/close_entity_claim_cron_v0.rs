use anchor_lang::prelude::*;
use tuktuk_program::{
  cron::{
    self,
    accounts::CronJobV0,
    cpi::{accounts::CloseCronJobV0, close_cron_job_v0},
    program::Cron,
  },
  tuktuk::program::Tuktuk,
};

#[derive(Accounts)]
pub struct CloseEntityClaimCronV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Just receiving funds.
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  pub user_authority: Signer<'info>,
  #[account(
    seeds = [b"entity_cron_authority", user_authority.key().as_ref()],
    bump,
  )]
  /// CHECK: Via seeds
  pub authority: AccountInfo<'info>,
  #[account(
    mut,
    seeds = [b"user_cron_jobs", authority.key().as_ref()],
    bump,
    seeds::program = cron_program.key(),
  )]
  /// CHECK: Via CPI
  pub user_cron_jobs: UncheckedAccount<'info>,
  #[account(mut, has_one = authority)]
  pub cron_job: Box<Account<'info, CronJobV0>>,
  #[account(mut)]
  /// CHECK: Via CPI
  pub cron_job_name_mapping: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub cron_program: Program<'info, Cron>,
  /// CHECK: Used to write return data
  #[account(
        mut,
        seeds = [b"task_return_account_1", cron_job.key().as_ref()],
        bump,
        seeds::program = cron::ID,
    )]
  pub task_return_account_1: AccountInfo<'info>,
  /// CHECK: Used to write return data
  #[account(
        mut,
        seeds = [b"task_return_account_2", cron_job.key().as_ref()],
        bump,
        seeds::program = cron::ID,
    )]
  pub task_return_account_2: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CloseEntityClaimCronV0>) -> Result<()> {
  close_cron_job_v0(CpiContext::new_with_signer(
    ctx.accounts.cron_program.to_account_info(),
    CloseCronJobV0 {
      authority: ctx.accounts.authority.to_account_info(),
      cron_job: ctx.accounts.cron_job.to_account_info(),
      cron_job_name_mapping: ctx.accounts.cron_job_name_mapping.to_account_info(),
      user_cron_jobs: ctx.accounts.user_cron_jobs.to_account_info(),
      system_program: ctx.accounts.system_program.to_account_info(),
      rent_refund: ctx.accounts.rent_refund.to_account_info(),
      task_return_account_1: ctx.accounts.task_return_account_1.to_account_info(),
      task_return_account_2: ctx.accounts.task_return_account_2.to_account_info(),
    },
    &[&[
      b"entity_cron_authority",
      ctx.accounts.user_authority.key().as_ref(),
      &[ctx.bumps.authority],
    ]],
  ))?;
  Ok(())
}
