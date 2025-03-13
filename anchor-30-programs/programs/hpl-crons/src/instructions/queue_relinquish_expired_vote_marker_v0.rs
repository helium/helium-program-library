use anchor_lang::{
  prelude::*,
  system_program::{self, transfer, Transfer},
  InstructionData,
};
use spl_token::solana_program::instruction::Instruction;
use tuktuk_program::{
  compile_transaction,
  tuktuk::{
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::QueueTaskArgsV0,
  TaskQueueAuthorityV0, TaskQueueV0, TaskV0, TransactionSourceV0, TriggerV0,
};

use crate::voter_stake_registry::{
  self,
  accounts::{PositionV0, VoteMarkerV0},
  client::args::RelinquishExpiredVoteV0,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct QueueRelinquishExpiredVoteMarkerArgsV0 {
  pub free_task_id: u16,
  pub trigger_ts: i64,
}

#[derive(Accounts)]
pub struct QueueRelinquishExpiredVoteMarkerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  #[account(
    constraint = position.mint == marker.mint
  )]
  pub position: Box<Account<'info, PositionV0>>,
  /// CHECK: Via seeds
  #[account(
    mut,
    seeds = [b"queue_authority"],
    bump,
  )]
  pub queue_authority: AccountInfo<'info>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk_program.key(),
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  #[account(mut)]
  /// CHECK: via cpi
  pub task: AccountInfo<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<QueueRelinquishExpiredVoteMarkerV0>,
  args: QueueRelinquishExpiredVoteMarkerArgsV0,
) -> Result<()> {
  let (compiled_tx, _) = compile_transaction(
    vec![Instruction {
      program_id: voter_stake_registry::ID,
      accounts: voter_stake_registry::client::accounts::RelinquishExpiredVoteV0 {
        marker: ctx.accounts.marker.key(),
        position: ctx.accounts.position.key(),
        proposal: ctx.accounts.marker.proposal.key(),
        system_program: system_program::ID,
        rent_refund: ctx.accounts.marker.rent_refund.key(),
      }
      .to_account_metas(None)
      .to_vec(),
      data: RelinquishExpiredVoteV0 {}.data(),
    }],
    vec![],
  )
  .unwrap();

  // Queue authority pays for the task rent if it can, since we know it'll come back
  // This makes voting cheaper for users.
  let mut payer = ctx.accounts.payer.to_account_info();
  let description = "relinquish expired vote marker".to_string();
  let len = 8 + std::mem::size_of::<TaskV0>() + 60 + description.len();
  let rent_needed = Rent::get()?.minimum_balance(len);
  if ctx.accounts.queue_authority.lamports() > rent_needed {
    payer = ctx.accounts.queue_authority.to_account_info();
    transfer(
      CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
          from: ctx.accounts.payer.to_account_info(),
          to: ctx.accounts.queue_authority.to_account_info(),
        },
        &[&["queue_authority".as_bytes(), &[ctx.bumps.queue_authority]]],
      ),
      ctx.accounts.task_queue.min_crank_reward,
    )?;
  }
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer,
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task: ctx.accounts.task.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&["queue_authority".as_bytes(), &[ctx.bumps.queue_authority]]],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(args.trigger_ts),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 0,
      id: args.free_task_id,
      description,
    },
  )?;

  Ok(())
}
