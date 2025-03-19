use anchor_lang::{
  prelude::*,
  system_program::{transfer, Transfer},
};
use tuktuk_program::{
  tuktuk::{
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::QueueTaskArgsV0,
  TaskQueueAuthorityV0, TaskQueueV0, TaskV0, TransactionSourceV0, TriggerV0,
};
use voter_stake_registry::state::ProxyMarkerV0;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct QueueProxyVoteArgsV0 {
  pub free_task_id: u16,
}

#[cfg(feature = "devnet")]
pub const VOTE_SERVICE_URL: &str = "https://helium-vote-service.web.test-helium.com";
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
  pub task: AccountInfo<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub const VOTER_MIN_LAMPORTS: u64 = 40000000;

pub fn handler(ctx: Context<QueueProxyVoteV0>, args: QueueProxyVoteArgsV0) -> Result<()> {
  if ctx.accounts.pda_wallet.lamports() < VOTER_MIN_LAMPORTS {
    // Fund the fee payer wallet with at least 0.04 SOL. This should be enough for ~2000 votes. The rest will be refunded.
    transfer(
      CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
          from: ctx.accounts.payer.to_account_info(),
          to: ctx.accounts.pda_wallet.to_account_info(),
        },
      ),
      VOTER_MIN_LAMPORTS.saturating_sub(ctx.accounts.pda_wallet.lamports()),
    )?;
  }

  // Queue authority pays for the task rent if it can, since we know it'll come back
  // This makes voting cheaper for users.
  let mut payer = ctx.accounts.payer.to_account_info();
  let description = "proxy vote".to_string();
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
      id: args.free_task_id,
      description,
    },
  )?;

  Ok(())
}
