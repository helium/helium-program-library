use std::str::FromStr;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use clockwork_cron::Schedule;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0,
};

use crate::{errors::ErrorCode, queue_authority_seeds, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateAutoTopOffArgsV0 {
  pub schedule: Option<String>,
  pub threshold: Option<u64>,
  pub hnt_threshold: Option<u64>,
  pub dca_swap_amount: Option<u64>,
  pub dca_interval_seconds: Option<u64>,
  pub dca_input_price_oracle: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateAutoTopOffArgsV0)]
pub struct UpdateAutoTopOffV0<'info> {
  pub authority: Signer<'info>,
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut, has_one = authority, has_one = next_task, has_one = task_queue, has_one = next_hnt_task)]
  pub auto_top_off: AccountLoader<'info, AutoTopOffV0>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = auto_top_off.load()?.queue_authority_bump,
  )]
  pub queue_authority: UncheckedAccount<'info>,
  /// CHECK: task queue authority
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Account<'info, TaskQueueAuthorityV0>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: current DC task account
  #[account(mut)]
  pub next_task: UncheckedAccount<'info>,
  /// CHECK: current HNT task account
  #[account(mut)]
  pub next_hnt_task: UncheckedAccount<'info>,
  /// CHECK: task rent refund account
  #[account(mut)]
  pub task_rent_refund: UncheckedAccount<'info>,
  /// CHECK: HNT task rent refund account
  #[account(mut)]
  pub hnt_task_rent_refund: UncheckedAccount<'info>,
  /// The mint the DCA leg spends from. Passed only to change it, together with its account
  /// below; omitting both leaves the leg pointed where it is.
  pub dca_mint: Option<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dca_mint,
    associated_token::authority = auto_top_off,
  )]
  pub dca_mint_account: Option<Account<'info, TokenAccount>>,
  /// The account the leg spends from today. Required when `dca_mint` names a different mint,
  /// so the balance it still holds is visible to the check below.
  #[account(address = auto_top_off.load()?.dca_mint_account)]
  pub current_dca_mint_account: Option<Account<'info, TokenAccount>>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<UpdateAutoTopOffV0>, args: UpdateAutoTopOffArgsV0) -> Result<()> {
  let auto_top_off_key = ctx.accounts.auto_top_off.key();
  let mut auto_top_off = ctx.accounts.auto_top_off.load_mut()?;

  // Update configuration fields
  if let Some(schedule) = args.schedule {
    Schedule::from_str(&schedule).map_err(|e| {
      msg!("Invalid schedule {}", e);
      ErrorCode::InvalidSchedule
    })?;
    let arr = schedule.as_bytes();
    let mut schedule = [0; 128];
    schedule[..arr.len()].copy_from_slice(arr);
    auto_top_off.schedule = schedule;
  }
  if let Some(threshold) = args.threshold {
    auto_top_off.threshold = threshold;
  }
  if let Some(hnt_threshold) = args.hnt_threshold {
    auto_top_off.hnt_threshold = hnt_threshold;
  }
  // The pair moves together or not at all: writing a mint without the account it is spent
  // from, or an account without its mint, would point the leg at a balance that is not there.
  match (&ctx.accounts.dca_mint, &ctx.accounts.dca_mint_account) {
    (Some(dca_mint), Some(dca_mint_account)) => {
      // The USDC sitting in the account the leg spends from today is reachable only through
      // that account, so the mint may only move once it holds nothing.
      if dca_mint.key() != auto_top_off.dca_mint {
        let emptied = ctx
          .accounts
          .current_dca_mint_account
          .as_ref()
          .is_some_and(|current| current.amount == 0);
        require!(emptied, ErrorCode::DcaMintAccountNotEmpty);
      }
      auto_top_off.dca_mint = dca_mint.key();
      auto_top_off.dca_mint_account = dca_mint_account.key();
    }
    (None, None) => {}
    _ => return Err(error!(ErrorCode::IncompleteDcaMintChange)),
  }
  if let Some(dca_swap_amount) = args.dca_swap_amount {
    auto_top_off.dca_swap_amount = dca_swap_amount;
  }
  if let Some(dca_interval_seconds) = args.dca_interval_seconds {
    // The HNT leg divides the slot by this to size a DCA, and a DCA whose orders never come
    // due drains nothing.
    require_gt!(dca_interval_seconds, 0, ErrorCode::InvalidDcaInterval);
    auto_top_off.dca_interval_seconds = dca_interval_seconds;
  }
  if let Some(dca_input_price_oracle) = args.dca_input_price_oracle {
    auto_top_off.dca_input_price_oracle = dca_input_price_oracle;
  }

  // Dequeue existing tasks (DC and HNT only, not Pyth)
  let queue_authority_bump = auto_top_off.queue_authority_bump;
  let seeds: &[&[&[u8]]] = &[queue_authority_seeds!(queue_authority_bump)];
  let task_queue = ctx.accounts.task_queue.to_account_info();
  let queue_authority = ctx.accounts.queue_authority.to_account_info();
  let task_queue_authority = ctx.accounts.task_queue_authority.to_account_info();

  if !ctx.accounts.next_task.data_is_empty()
    && ctx.accounts.next_task.key() != ctx.accounts.auto_top_off.key()
  {
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: task_queue.clone(),
        task: ctx.accounts.next_task.to_account_info(),
        queue_authority: queue_authority.clone(),
        rent_refund: ctx.accounts.task_rent_refund.to_account_info(),
        task_queue_authority: task_queue_authority.clone(),
      },
      seeds,
    ))?;
  }
  // The address the field named is gone, and the leg is unscheduled until something queues it
  // again. `auto_top_off.key()` is how every reader of these fields spells that.
  auto_top_off.next_task = auto_top_off_key;

  if !ctx.accounts.next_hnt_task.data_is_empty()
    && ctx.accounts.next_hnt_task.key() != ctx.accounts.auto_top_off.key()
  {
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue,
        task: ctx.accounts.next_hnt_task.to_account_info(),
        queue_authority,
        rent_refund: ctx.accounts.hnt_task_rent_refund.to_account_info(),
        task_queue_authority,
      },
      seeds,
    ))?;
  }
  auto_top_off.next_hnt_task = auto_top_off_key;

  Ok(())
}
