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
  self, accounts::ProxyMarkerV0, client::args::RelinquishExpiredVoteV0,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct QueueProxyVoteArgsV0 {
  pub free_task_ids: [u16; 2],
  pub vote_end_ts: i64,
}

#[cfg(feature = "devnet")]
// const VOTE_SERVICE_URL: &str = "https://helium-vote-service.web.test-helium.com";
pub const VOTE_SERVICE_URL: &str = "http://localhost:3000";
#[cfg(feature = "devnet")]
pub const VOTE_SERVICE_SIGNER: Pubkey = pubkey!("vtedYdD9pKu9seuWwePQYTWLa2aUc5SWsDv1crmNJit");

#[cfg(not(feature = "devnet"))]
pub const VOTE_SERVICE_URL: &str = "https://helium-vote-service.web.helium.io";
#[cfg(not(feature = "devnet"))]
pub const VOTE_SERVICE_SIGNER: Pubkey = pubkey!("vtedYdD9pKu9seuWwePQYTWLa2aUc5SWsDv1crmNJit");

#[derive(Accounts)]
pub struct QueueProxyVoteV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Used in seeds
  pub voter: AccountInfo<'info>,
  #[account(
    has_one = voter,
  )]
  pub marker: Box<Account<'info, ProxyMarkerV0>>,
  /// CHECK: via seeds
  #[account(
    mut,
    seeds = [b"custom", task_queue.key().as_ref(), b"vote_payer", voter.key().as_ref()],
    seeds::program = tuktuk_program::tuktuk::ID,
    bump,
  )]
  pub pda_wallet: AccountInfo<'info>,
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
  pub task_1: AccountInfo<'info>,
  #[account(mut)]
  /// CHECK: via cpi
  pub task_2: AccountInfo<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<QueueProxyVoteV0>, args: QueueProxyVoteArgsV0) -> Result<()> {
  // Fund the fee payer wallet with 0.04 SOL. This should be enough for ~2000 votes. The rest will be refunded.
  transfer(
    CpiContext::new(
      ctx.accounts.system_program.to_account_info(),
      Transfer {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.pda_wallet.to_account_info(),
      },
    ),
    40000000,
  )?;

  // Queue authority pays for the task rent if it can, since we know it'll come back
  // This makes voting cheaper for users.
  let mut payer = ctx.accounts.payer.to_account_info();
  let description = "proxy vote".to_string();
  let len = 8 + std::mem::size_of::<TaskV0>() + 60 + description.len();
  let rent_needed = 2 * Rent::get()?.minimum_balance(len);
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

  // First, queue the remote transaction to track all votes.
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer,
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task: ctx.accounts.task_1.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&["queue_authority".as_bytes(), &[ctx.bumps.queue_authority]]],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Now,
      transaction: TransactionSourceV0::RemoteV0 {
        url: format!(
          "{}/v1/proposals/{}/proxy-vote/{}",
          VOTE_SERVICE_URL, ctx.accounts.marker.proposal, ctx.accounts.marker.voter
        ),
        signer: VOTE_SERVICE_SIGNER,
      },
      crank_reward: None,
      free_tasks: 1,
      id: args.free_task_ids[0],
      description,
    },
  )?;

  // Next, queue the compiled transaction to relinquish the expired vote.
  let (compiled_tx, _) = compile_transaction(
    vec![Instruction {
      program_id: voter_stake_registry::ID,
      accounts: voter_stake_registry::client::accounts::ProxiedRelinquishVoteV1 {
        marker: ctx.accounts.marker.key(),
        proposal: ctx.accounts.marker.proposal.key(),
        system_program: system_program::ID,
        voter: ctx.accounts.voter.key(),
      }
      .to_account_metas(None)
      .to_vec(),
      data: RelinquishExpiredVoteV0 {}.data(),
    }],
    vec![],
  )
  .unwrap();

  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.accounts.payer.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task: ctx.accounts.task_2.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&["queue_authority".as_bytes(), &[ctx.bumps.queue_authority]]],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(args.vote_end_ts + 1),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 0,
      id: args.free_task_ids[1],
      description: "relinquish expired proxy vote".to_string(),
    },
  )?;

  Ok(())
}
