use std::cmp::max;

use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use tuktuk_program::{
  compile_transaction,
  tuktuk::{
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::QueueTaskArgsV0,
  TaskQueueAuthorityV0, TaskQueueV0, TransactionSourceV0, TriggerV0,
};

use crate::state::{SessionManagerV0, SessionV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeSessionArgsV0 {
  pub expiration_seconds: u64,
  pub application: String,
  pub permissions: Vec<String>,
  pub task_id: u16,
}

#[derive(Accounts)]
#[instruction(args: InitializeSessionArgsV0)]
pub struct InitializeSessionV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub wallet: Signer<'info>,
  /// CHECK: This is basically an arg
  pub temporary_authority: AccountInfo<'info>,
  /// CHECK: Just used to receive rent refund
  pub rent_refund: AccountInfo<'info>,

  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<SessionV0>() + 32,
    seeds = [b"session", args.application.as_bytes(), wallet.key().as_ref()],
    bump
  )]
  pub session: Box<Account<'info, SessionV0>>,

  #[account(
    has_one = task_queue,
    constraint = args.expiration_seconds <= session_manager.max_session_expiration_ts @ crate::errors::ErrorCode::ExpirationTooLong,
  )]
  pub session_manager: Box<Account<'info, SessionManagerV0>>,

  #[account(mut)]
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
  /// CHECK: Being initialize via cpi
  #[account(mut)]
  pub task: AccountInfo<'info>,

  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeSessionV0>, args: InitializeSessionArgsV0) -> Result<()> {
  // Create session
  ctx.accounts.session.set_inner(SessionV0 {
    wallet: ctx.accounts.wallet.key(),
    temporary_authority: ctx.accounts.temporary_authority.key(),
    expiration_ts: (Clock::get()?.unix_timestamp as u64) + args.expiration_seconds,
    application: args.application,
    bump_seed: ctx.bumps.session,
    permissions: args.permissions,
    rent_refund: ctx.accounts.rent_refund.key(),
  });

  // Schedule close task
  let (compiled_tx, _) = compile_transaction(
    vec![Instruction {
      program_id: crate::ID,
      accounts: crate::__client_accounts_close_session_v0::CloseSessionV0 {
        session: ctx.accounts.session.key(),
        rent_refund: ctx.accounts.rent_refund.key(),
        system_program: ctx.accounts.system_program.key(),
      }
      .to_account_metas(None),
      data: crate::instruction::CloseSessionV0.data(),
    }],
    vec![],
  )?;

  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.accounts.payer.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task: ctx.accounts.task.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&[b"queue_authority", &[ctx.bumps.queue_authority]]],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(max(
        Clock::get()?.unix_timestamp,
        args.expiration_seconds as i64,
      )),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 0,
      id: args.task_id,
      description: format!("close session {}", ctx.accounts.session.key())[..40].to_string(),
    },
  )?;

  Ok(())
}
