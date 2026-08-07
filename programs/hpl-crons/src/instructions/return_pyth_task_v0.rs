use anchor_lang::{
  prelude::*,
  system_program::{transfer, Transfer},
};
use tuktuk_program::{
  RunTaskReturnV0, TaskQueueV0, TaskReturnV0, TaskV0, TransactionSourceV0, TriggerV0,
};

use crate::error::ErrorCode;

/// Passthrough: Just returns the tasks passed to it as args.
/// This is useful for remote transactions to schedule themselves.
#[derive(Accounts)]
pub struct ReturnPythTaskV0<'info> {
  pub task_queue: Account<'info, TaskQueueV0>,
  // The handler funds the returned task by transferring into this account, so it must be
  // writable even for direct (non-run_task) invocations built from the IDL.
  #[account(mut, has_one = task_queue)]
  pub task: Account<'info, TaskV0>,
  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReturnPythTaskArgsV0 {
  pub index: u8,
  pub free_tasks: u8,
}

pub fn handler(
  ctx: Context<ReturnPythTaskV0>,
  args: ReturnPythTaskArgsV0,
) -> Result<RunTaskReturnV0> {
  // A pyth verification chain hands the next step back to the queue one step at a time, so a
  // single returned task is all this instruction ever needs.
  const MAX_FREE_TASKS: u8 = 1;
  require_gte!(MAX_FREE_TASKS, args.free_tasks, ErrorCode::TooManyFreeTasks);

  let (signer, base_url) = match &ctx.accounts.task.transaction {
    TransactionSourceV0::CompiledV0(_) => return Err(ErrorCode::InvalidTaskForPyth.into()),
    TransactionSourceV0::RemoteV0 { signer, url } => (signer, url.split("?").next().unwrap()),
  };

  transfer(
    CpiContext::new(
      ctx.accounts.system_program.to_account_info(),
      Transfer {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.task.to_account_info(),
      },
    ),
    args.free_tasks as u64 * ctx.accounts.task_queue.min_crank_reward,
  )?;
  Ok(RunTaskReturnV0 {
    tasks: vec![TaskReturnV0 {
      trigger: TriggerV0::Now {},
      description: format!("verify {}", args.index),
      transaction: TransactionSourceV0::RemoteV0 {
        signer: *signer,
        url: format!("{}?i={}", base_url, args.index),
      },
      crank_reward: None,
      free_tasks: args.free_tasks,
    }],
    accounts: vec![],
  })
}
