use anchor_lang::prelude::*;
use tuktuk_program::{
  cron::{
    cpi::{accounts::InitializeCronJobV0, initialize_cron_job_v0},
    program::Cron,
    types::InitializeCronJobArgsV0,
  },
  tuktuk::program::Tuktuk,
  TaskQueueAuthorityV0, TaskQueueV0,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitEntityClaimCronArgsV0 {
  pub schedule: String,
}

#[derive(Accounts)]
pub struct InitEntityClaimCronV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = [b"queue_authority"],
    bump,
  )]
  /// CHECK: Via seeds
  pub queue_authority: AccountInfo<'info>,
  #[account(
        seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
        bump = task_queue_authority.bump_seed,
        seeds::program = tuktuk_program.key(),
    )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
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
  #[account(mut)]
  /// CHECK: Via CPI
  pub cron_job: UncheckedAccount<'info>,
  #[account(mut)]
  /// CHECK: Via CPI
  pub cron_job_name_mapping: AccountInfo<'info>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  /// CHECK: Initialized in CPI
  #[account(mut)]
  pub task: AccountInfo<'info>,
  /// CHECK: Used to write return data
  #[account(
    mut,
    seeds = [b"task_return_account_1", cron_job.key().as_ref()],
    bump,
    seeds::program = cron_program.key()
  )]
  pub task_return_account_1: AccountInfo<'info>,
  /// CHECK: Used to write return data
  #[account(
    mut,
    seeds = [b"task_return_account_2", cron_job.key().as_ref()],
    bump,
    seeds::program = cron_program.key()
  )]
  pub task_return_account_2: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub cron_program: Program<'info, Cron>,
}

pub fn handler(ctx: Context<InitEntityClaimCronV0>, args: InitEntityClaimCronArgsV0) -> Result<()> {
  initialize_cron_job_v0(
    CpiContext::new_with_signer(
      ctx.accounts.cron_program.to_account_info(),
      InitializeCronJobV0 {
        cron_job: ctx.accounts.cron_job.to_account_info(),
        cron_job_name_mapping: ctx.accounts.cron_job_name_mapping.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.task.to_account_info(),
        task_return_account_1: ctx.accounts.task_return_account_1.to_account_info(),
        task_return_account_2: ctx.accounts.task_return_account_2.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        user_cron_jobs: ctx.accounts.user_cron_jobs.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        tuktuk_program: ctx.accounts.tuktuk_program.to_account_info(),
      },
      &[
        &[
          b"entity_cron_authority",
          ctx.accounts.user_authority.key().as_ref(),
          &[ctx.bumps.authority],
        ],
        &[b"queue_authority", &[ctx.bumps.queue_authority]],
      ],
    ),
    InitializeCronJobArgsV0 {
      schedule: args.schedule,
      name: "entity_claim".to_string(),
      free_tasks_per_transaction: 6,
      num_tasks_per_queue_call: 8,
    },
  )?;
  Ok(())
}
