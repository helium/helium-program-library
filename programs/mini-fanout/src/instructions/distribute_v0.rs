use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use tuktuk_program::{
  RunTaskReturnV0, TaskQueueV0, TaskReturnV0, TaskV0, TransactionSourceV0, TriggerV0,
};

use crate::{errors::ErrorCode, get_next_time, get_task_ix, state::*};

const DUST_PRECISION: u128 = 1_000_000_000_000;

#[derive(Accounts)]
pub struct DistributeV0<'info> {
  #[account(
    mut,
    has_one = task_queue,
    has_one = next_task,
    has_one = next_pre_task
  )]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    constraint = match next_task.trigger {
      TriggerV0::Now => true,
      TriggerV0::Timestamp(timestamp) => timestamp <= Clock::get()?.unix_timestamp,
    } @ ErrorCode::TaskNotDue
  )]
  pub next_task: Box<Account<'info, TaskV0>>,
  /// CHECK: Make sure this is empty, pre task needs to be run before task.
  #[account(
    constraint = next_pre_task.data_is_empty() || next_pre_task.key() == crate::ID @ ErrorCode::PreTaskNotRun
  )]
  pub next_pre_task: UncheckedAccount<'info>,
  #[account(mut)]
  pub token_account: Box<Account<'info, TokenAccount>>,
  pub token_program: Program<'info, Token>,
  // Remaining accounts: shareholder token accounts (as TokenAccount)
}

impl Share {
  pub fn as_u32(&self) -> u32 {
    match self {
      Share::Share { amount } => *amount,
      Share::Fixed { amount: _ } => 0,
    }
  }
  pub fn as_u128(&self) -> u128 {
    match self {
      Share::Share { amount } => *amount as u128,
      Share::Fixed { amount } => *amount as u128,
    }
  }
}

#[macro_export]
macro_rules! try_from {
  ($ty: ty, $acc: expr) => {{
    let account_info = $acc.as_ref();
    <$ty>::try_from(unsafe {
      core::mem::transmute::<
        &anchor_lang::prelude::AccountInfo<'_>,
        &anchor_lang::prelude::AccountInfo<'_>,
      >(account_info)
    })
  }};
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, DistributeV0<'info>>,
) -> Result<RunTaskReturnV0> {
  let mini_fanout = &mut ctx.accounts.mini_fanout;
  let token_account = &ctx.accounts.token_account;

  // 1. Calculate total fixed payout and collect indices
  let mut total_fixed: u128 = 0;
  let mut fixed_indices = vec![];
  let mut share_indices = vec![];
  for (i, share) in mini_fanout.shares.iter().enumerate() {
    match &share.share {
      Share::Fixed { amount } => {
        total_fixed = total_fixed.saturating_add(*amount as u128);
        fixed_indices.push(i);
      }
      Share::Share { amount: _ } => {
        share_indices.push(i);
      }
    }
  }

  // 2. Calculate remaining tokens after fixed payouts
  let total_dust: u128 = mini_fanout
    .shares
    .iter()
    .map(|s| s.total_dust as u128)
    .sum::<u128>()
    .checked_div(DUST_PRECISION)
    .ok_or(error!(ErrorCode::ArithmeticError))?;
  let mut remaining = token_account.amount as u128 - total_dust;

  // 3. Assign fixed payouts in order, saturating if not enough left
  let mut new_dusts = vec![0u128; mini_fanout.shares.len()];
  let mut payouts = vec![0u64; mini_fanout.shares.len()];
  for &i in &fixed_indices {
    let fixed_val = match mini_fanout.shares[i].share {
      Share::Fixed { amount } => amount as u128 + mini_fanout.shares[i].total_owed as u128,
      _ => 0,
    };
    let payout = remaining.min(fixed_val);
    payouts[i] = payout as u64;
    new_dusts[i] = mini_fanout.shares[i].total_dust as u128;
    remaining = remaining.saturating_sub(payout);
  }

  // 4. Calculate total shares for percent distribution
  let total_shares: u32 = share_indices
    .iter()
    .map(|&i| mini_fanout.shares[i].share.as_u32())
    .sum();

  // 5. Assign share payouts
  for &i in &share_indices {
    let share = &mini_fanout.shares[i];
    let share_val = share.share.as_u128();
    let amount = remaining
      .checked_mul(share_val)
      .ok_or(error!(ErrorCode::ArithmeticError))?
      .checked_mul(DUST_PRECISION)
      .ok_or(error!(ErrorCode::ArithmeticError))?
      .checked_div(total_shares as u128)
      .ok_or(error!(ErrorCode::ArithmeticError))?;
    let payout = u64::try_from(
      amount
        .checked_div(DUST_PRECISION)
        .ok_or(error!(ErrorCode::ArithmeticError))?,
    )
    .map_err(|_| error!(ErrorCode::ArithmeticError))?;
    let dust = u64::try_from(
      amount
        .checked_rem(DUST_PRECISION)
        .ok_or(error!(ErrorCode::ArithmeticError))?,
    )
    .map_err(|_| error!(ErrorCode::ArithmeticError))?
    .checked_add(share.total_dust)
    .ok_or(error!(ErrorCode::ArithmeticError))?;
    if dust >= DUST_PRECISION as u64 {
      payouts[i] = payout
        .checked_add(1)
        .ok_or(error!(ErrorCode::ArithmeticError))?;
      new_dusts[i] = dust
        .checked_sub(DUST_PRECISION as u64)
        .ok_or(error!(ErrorCode::ArithmeticError))?
        .into();
    } else {
      payouts[i] = payout;
      new_dusts[i] = dust as u128;
    }
  }

  let token_account_info = token_account.to_account_info();
  let token_program_info = ctx.accounts.token_program.to_account_info();
  let mini_fanout_info = mini_fanout.to_account_info();
  // Have to vec/clone the seeds since we're borrowing mini_fanout is mutable to edit the shares
  let seeds_vec = crate::fanout_seeds!(mini_fanout)
    .iter()
    .map(|s| s.to_vec())
    .collect::<Vec<_>>();
  let seeds_refs: Vec<&[u8]> = seeds_vec.iter().map(|v| v.as_slice()).collect();
  let seeds_slice: &[&[u8]] = &seeds_refs;
  for (i, share) in mini_fanout.shares.iter_mut().enumerate() {
    let to_token_account = &mut ctx.remaining_accounts[i].to_account_info();
    if payouts[i] > 0 {
      if to_token_account.data_is_empty() {
        share.total_owed = payouts[i];
      } else {
        let parsed_to_token_account: Account<TokenAccount> =
          try_from!(Account<TokenAccount>, to_token_account)?;

        require_eq!(
          parsed_to_token_account.owner,
          share.destination(),
          ErrorCode::InvalidOwner
        );
        let cpi_ctx = CpiContext::new(
          token_program_info.clone(),
          Transfer {
            from: token_account_info.clone(),
            to: to_token_account.clone(),
            authority: mini_fanout_info.clone(),
          },
        );
        token::transfer(cpi_ctx.with_signer(&[seeds_slice]), payouts[i])?;
      }
    }
    share.total_dust = new_dusts[i] as u64;
  }

  // Pay min crank reward to task_queue from mini_fanout, if available
  let min_rent_exempt = Rent::get()?.minimum_balance(mini_fanout_info.data_len());
  if mini_fanout_info.lamports() - min_rent_exempt >= ctx.accounts.task_queue.min_crank_reward {
    mini_fanout.sub_lamports(ctx.accounts.task_queue.min_crank_reward * 2)?;
    ctx
      .accounts
      .task_queue
      .add_lamports(ctx.accounts.task_queue.min_crank_reward * 2)?;
  } else {
    mini_fanout.next_task = crate::ID;
    mini_fanout.next_pre_task = crate::ID;
    return Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    });
  }

  mini_fanout.next_task = ctx.remaining_accounts[mini_fanout.shares.len()].key();
  mini_fanout.next_pre_task = ctx.remaining_accounts[mini_fanout.shares.len() + 1].key();

  // Schedule next task via tuktuk CPI if funds available, else set next_task = Pubkey::default()
  let next_time = get_next_time(mini_fanout)?;
  let compiled_tx = get_task_ix(mini_fanout)?;
  let mut tasks = vec![TaskReturnV0 {
    trigger: TriggerV0::Timestamp(next_time),
    transaction: TransactionSourceV0::CompiledV0(compiled_tx),
    crank_reward: None,
    free_tasks: 0,
    description: format!("dist {}", &mini_fanout.key().to_string()[..(32 - 9)]),
  }];
  if let Some(pre_task) = mini_fanout.pre_task.clone() {
    tasks.push(TaskReturnV0 {
      trigger: TriggerV0::Timestamp(next_time - 1),
      transaction: pre_task,
      crank_reward: None,
      free_tasks: 0,
      description: format!(
        "pre dist {}",
        &mini_fanout.key().to_string()[..(32 - 9 - 4)]
      ),
    });
  }

  Ok(RunTaskReturnV0 {
    tasks,
    accounts: vec![],
  })
}
