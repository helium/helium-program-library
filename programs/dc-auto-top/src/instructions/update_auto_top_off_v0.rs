use std::str::FromStr;

use anchor_lang::prelude::*;
use clockwork_cron::Schedule;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0,
};

use crate::{queue_authority_seeds, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateAutoTopOffArgsV0 {
  pub schedule: Option<String>,
  pub threshold: Option<u64>,
  pub hnt_price_oracle: Option<Pubkey>,
  pub hnt_threshold: Option<u64>,
  pub dca_mint: Option<Pubkey>,
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
    bump
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
  pub tuktuk_program: Program<'info, Tuktuk>,
}

pub fn handler(ctx: Context<UpdateAutoTopOffV0>, args: UpdateAutoTopOffArgsV0) -> Result<()> {
  let mut auto_top_off = ctx.accounts.auto_top_off.load_mut()?;

  // Update configuration fields
  if let Some(schedule) = args.schedule {
    Schedule::from_str(&schedule).map_err(|e| {
      msg!("Invalid schedule {}", e);
      crate::errors::ErrorCode::InvalidSchedule
    })?;
    let arr = schedule.as_bytes();
    let mut schedule = [0; 128];
    schedule[..arr.len()].copy_from_slice(arr);
    auto_top_off.schedule = schedule;
  }
  if let Some(threshold) = args.threshold {
    auto_top_off.threshold = threshold;
  }
  if let Some(hnt_price_oracle) = args.hnt_price_oracle {
    auto_top_off.hnt_price_oracle = hnt_price_oracle;
  }
  if let Some(hnt_threshold) = args.hnt_threshold {
    auto_top_off.hnt_threshold = hnt_threshold;
  }
  if let Some(dca_mint) = args.dca_mint {
    auto_top_off.dca_mint = dca_mint;
  }
  if let Some(dca_swap_amount) = args.dca_swap_amount {
    auto_top_off.dca_swap_amount = dca_swap_amount;
  }
  if let Some(dca_interval_seconds) = args.dca_interval_seconds {
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

  if !ctx.accounts.next_task.data_is_empty() {
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

  if !ctx.accounts.next_hnt_task.data_is_empty() {
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

  Ok(())
}
