use anchor_lang::prelude::*;
use tuktuk_program::{TaskQueueAuthorityV0, TaskQueueV0};

use crate::SessionManagerV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeSessionManagerArgsV0 {
  pub max_session_expiration_ts: u64,
}

#[derive(Accounts)]
pub struct InitializeSessionManagerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: This is basically an arg
  pub authority: AccountInfo<'info>,

  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<SessionManagerV0>(),
    seeds = [b"session_manager"],
    bump
  )]
  pub session_manager: Box<Account<'info, SessionManagerV0>>,

  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk_program::tuktuk::ID,
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: Via seeds
  #[account(
    seeds = [b"queue_authority"],
    bump,
  )]
  pub queue_authority: AccountInfo<'info>,

  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeSessionManagerV0>,
  args: InitializeSessionManagerArgsV0,
) -> Result<()> {
  ctx.accounts.session_manager.set_inner(SessionManagerV0 {
    authority: ctx.accounts.authority.key(),
    task_queue: ctx.accounts.task_queue.key(),
    max_session_expiration_ts: args.max_session_expiration_ts,
    bump_seed: ctx.bumps.session_manager,
  });

  Ok(())
}
