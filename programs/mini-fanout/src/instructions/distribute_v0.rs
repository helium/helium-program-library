use anchor_lang::{
  prelude::*,
  solana_program::sysvar::instructions::{get_instruction_relative, ID as IX_ID},
};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use shared_utils::try_from;
use tuktuk_program::{
  tuktuk, RunTaskReturnV0, TaskQueueV0, TaskReturnV0, TransactionSourceV0, TriggerV0,
};

use crate::{errors::ErrorCode, get_next_time, get_task_ix, state::*};

const DUST_PRECISION: u128 = 1_000_000_000_000;

#[derive(Accounts)]
pub struct DistributeV0<'info> {
  #[account(
    mut,
    has_one = task_queue,
    has_one = next_pre_task,
    has_one = token_account
  )]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  /// CHECK: A queued pre task has to run before the distribution it precedes. A fanout that
  /// queues none has nothing to wait for, and this handler only writes the slot, so the
  /// account there does not gate it.
  #[account(
    constraint = mini_fanout.pre_task.is_none() || next_pre_task.data_is_empty() || next_pre_task.key() == mini_fanout.key() @ ErrorCode::PreTaskNotRun
  )]
  pub next_pre_task: UncheckedAccount<'info>,
  #[account(mut)]
  pub token_account: Box<Account<'info, TokenAccount>>,
  pub token_program: Program<'info, Token>,
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  /// The Instruction Sysvar has not been implemented
  /// in the Anchor framework yet, so this is the safe approach.
  #[account(address = IX_ID)]
  pub instruction_sysvar: AccountInfo<'info>,
  // Remaining accounts: shareholder token accounts (as TokenAccount)
}

impl Share {
  pub fn as_u128(&self) -> u128 {
    match self {
      Share::Share { amount } => *amount as u128,
      Share::Fixed { amount } => *amount as u128,
    }
  }
}

pub fn verify_running_in_tuktuk(instruction_sysvar: AccountInfo, task_id: Pubkey) -> Result<()> {
  // Validate that this instruction is being called via CPI from tuktuk for the next_task
  let current_ix = get_instruction_relative(0, &instruction_sysvar)
    .map_err(|_| error!(ErrorCode::InvalidCpiContext))?;

  // Check that the current instruction is being called by tuktuk program
  require_eq!(
    current_ix.program_id,
    tuktuk::ID,
    ErrorCode::InvalidCpiContext
  );

  // Check that the instruction being called is run_task_v0 by verifying the discriminator
  // The discriminator for run_task_v0 is the first 8 bytes of SHA256("global:run_task_v0")
  const RUN_TASK_V0_DISCRIMINATOR: [u8; 8] = [0x34, 0xb8, 0x27, 0x81, 0x7e, 0xf5, 0xb0, 0xed];
  require!(current_ix.data.len() >= 8, ErrorCode::InvalidCpiContext);
  require!(
    current_ix.data[0..8] == RUN_TASK_V0_DISCRIMINATOR,
    ErrorCode::InvalidCpiContext
  );

  // Verify that the next_task account matches the task being executed
  // The first account in the instruction should be the task account
  require!(
    !current_ix.accounts.is_empty(),
    ErrorCode::InvalidCpiContext
  );
  require_eq!(
    current_ix.accounts[3].pubkey,
    task_id,
    ErrorCode::InvalidCpiContext
  );

  Ok(())
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, DistributeV0<'info>>,
) -> Result<RunTaskReturnV0> {
  verify_running_in_tuktuk(
    ctx.accounts.instruction_sysvar.to_account_info(),
    ctx.accounts.mini_fanout.next_task,
  )?;

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
    / DUST_PRECISION;
  let mut remaining = (token_account.amount as u128).saturating_sub(total_dust);

  // 3. Assign fixed payouts in order, saturating if not enough left
  let mut new_dusts = vec![0u128; mini_fanout.shares.len()];
  let mut payouts = vec![0u64; mini_fanout.shares.len()];
  for &i in &fixed_indices {
    let fixed_val = match mini_fanout.shares[i].share {
      Share::Fixed { amount } => amount as u128 + mini_fanout.shares[i].total_owed as u128,
      _ => 0,
    };
    let payout = if fixed_val > remaining {
      mini_fanout.shares[i].total_owed = (fixed_val - remaining) as u64;
      remaining
    } else {
      mini_fanout.shares[i].total_owed = 0;
      fixed_val
    };
    payouts[i] = payout as u64;
    new_dusts[i] = mini_fanout.shares[i].total_dust as u128;
    remaining = remaining.saturating_sub(payout);
  }

  // 4. Calculate total shares for percent distribution
  let total_shares: u128 = share_indices
    .iter()
    .map(|&i| mini_fanout.shares[i].share.as_u128())
    .sum();

  // 5. Settle what a share member is still owed from a distribution whose transfer
  // could not land, off the top and in order, so the proportional split below divides
  // only what is left.
  let mut owed_payouts = vec![0u64; mini_fanout.shares.len()];
  for &i in &share_indices {
    let owed = mini_fanout.shares[i].total_owed as u128;
    if owed == 0 {
      continue;
    }
    let paid = owed.min(remaining);
    // `owed` came from a u64 and `paid` is clamped to it, so both fit.
    mini_fanout.shares[i].total_owed = (owed - paid) as u64;
    owed_payouts[i] = paid as u64;
    remaining = remaining.saturating_sub(paid);
  }

  // 6. Assign share payouts
  for &i in &share_indices {
    let share = &mini_fanout.shares[i];
    let share_val = share.share.as_u128();
    let amount = remaining
      .checked_mul(share_val)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?
      .checked_mul(DUST_PRECISION)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?
      .checked_div(total_shares)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
    let payout =
      u64::try_from(amount / DUST_PRECISION).map_err(|_| error!(ErrorCode::ArithmeticError))?;
    let dust = u64::try_from(amount % DUST_PRECISION)
      .map_err(|_| error!(ErrorCode::ArithmeticError))?
      .checked_add(share.total_dust)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
    if dust >= DUST_PRECISION as u64 {
      payouts[i] = payout
        .checked_add(1)
        .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
      // The branch condition is what makes this subtraction safe.
      new_dusts[i] = (dust - DUST_PRECISION as u64).into();
    } else {
      payouts[i] = payout;
      new_dusts[i] = dust as u128;
    }
    payouts[i] = payouts[i]
      .checked_add(owed_payouts[i])
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
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
        share.total_owed += payouts[i];
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
  if mini_fanout_info.lamports() - min_rent_exempt >= ctx.accounts.task_queue.min_crank_reward * 2 {
    mini_fanout.sub_lamports(ctx.accounts.task_queue.min_crank_reward * 2)?;
    ctx
      .accounts
      .task_queue
      .add_lamports(ctx.accounts.task_queue.min_crank_reward * 2)?;
  } else {
    mini_fanout.next_task = mini_fanout.key();
    mini_fanout.next_pre_task = mini_fanout.key();
    return Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    });
  }

  // tuktuk takes one free task account per task returned and validates it as it is
  // taken, and a validation that fails takes this write with it, so a recorded slot is
  // one it accepted. The pre task slot is recorded only when a pre task takes it; the
  // fanout's own key is the sentinel for there being no next pre task.
  let self_key = mini_fanout.key();
  let pre_task = mini_fanout.pre_task_to_queue()?;
  let free_task_base = mini_fanout.shares.len();
  let free_task_at = |offset: usize| -> Result<Pubkey> {
    Ok(
      ctx
        .remaining_accounts
        .get(free_task_base + offset)
        .ok_or_else(|| error!(ErrorCode::MissingFreeTask))?
        .key(),
    )
  };

  mini_fanout.next_task = free_task_at(0)?;
  mini_fanout.next_pre_task = match pre_task {
    Some(_) => free_task_at(1)?,
    None => self_key,
  };

  // Schedule next task via tuktuk CPI if funds available, else set next_task = Pubkey::default()
  let next_time = get_next_time(mini_fanout)?;
  let compiled_tx = get_task_ix(mini_fanout)?;
  let mut tasks = vec![TaskReturnV0 {
    trigger: TriggerV0::Timestamp(next_time),
    transaction: TransactionSourceV0::CompiledV0(compiled_tx),
    crank_reward: None,
    // One slot for the next distribution, and a second only when it queues a pre task.
    free_tasks: if pre_task.is_some() { 2 } else { 1 },
    description: format!("dist {}", &self_key.to_string()[..(32 - 9)]),
  }];
  if let Some(pre_task) = pre_task {
    tasks.push(TaskReturnV0 {
      trigger: TriggerV0::Timestamp(next_time - 1),
      transaction: pre_task,
      crank_reward: None,
      free_tasks: 0,
      description: format!("pre dist {}", &self_key.to_string()[..(32 - 9 - 4)]),
    });
  }

  Ok(RunTaskReturnV0 {
    tasks,
    accounts: vec![],
  })
}
