use std::{collections::HashMap, str::FromStr};

use anchor_lang::{
  prelude::*,
  solana_program::{instruction::Instruction, system_program, sysvar::instructions::ID as IX_ID},
  InstructionData,
};
use anchor_spl::{associated_token, token::spl_token};
use chrono::{DateTime, Utc};
use clockwork_cron::Schedule;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::{QueueTaskArgsV0, TransactionSourceV0, TriggerV0},
  CompiledInstructionV0, CompiledTransactionV0, TaskQueueAuthorityV0,
};

use crate::{queue_authority_seeds, state::*, ASSOCIATED_TOKEN_PROGRAM_ID};

const HNT_PRICE_ORACLE: Pubkey = pubkey!("4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScheduleTaskArgsV0 {
  pub task_id: u16,     // DC topoff task
  pub hnt_task_id: u16, // HNT topoff task
}

#[derive(Accounts)]
#[instruction(args: ScheduleTaskArgsV0)]
pub struct ScheduleTaskV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    has_one = next_task,
    has_one = next_hnt_task,
    has_one = task_queue,
  )]
  pub auto_top_off: AccountLoader<'info, AutoTopOffV0>,
  /// CHECK: Via constraint
  /// Only allow one task to be scheduled at a time
  #[account(
    constraint = next_task.data_is_empty() || next_task.key() == auto_top_off.key()
  )]
  pub next_task: UncheckedAccount<'info>,
  /// CHECK: Via constraint
  /// Only allow one task to be scheduled at a time
  #[account(
    constraint = next_hnt_task.data_is_empty() || next_hnt_task.key() == auto_top_off.key()
  )]
  pub next_hnt_task: UncheckedAccount<'info>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = auto_top_off.load()?.queue_authority_bump,
  )]
  pub queue_authority: UncheckedAccount<'info>,
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Account<'info, TaskQueueAuthorityV0>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: DC topoff task account to be created
  #[account(mut)]
  pub task: UncheckedAccount<'info>,
  /// CHECK: HNT topoff task account to be created
  #[account(mut)]
  pub hnt_task: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn get_task_ix_dc(
  auto_top_off_key: Pubkey,
  auto_top_off: &AutoTopOffV0,
) -> Result<CompiledTransactionV0> {
  // Construct the transaction to call top_off_dc_v0 on this program
  let distribute_accounts = crate::__client_accounts_top_off_dc_v0::TopOffDcV0 {
    auto_top_off: auto_top_off_key,
    data_credits: auto_top_off.data_credits,
    sub_dao: auto_top_off.sub_dao,
    token_program: spl_token::ID,
    task_queue: auto_top_off.task_queue,
    delegated_data_credits: auto_top_off.delegated_data_credits,
    dc_mint: auto_top_off.dc_mint,
    hnt_mint: auto_top_off.hnt_mint,
    dao: auto_top_off.dao,
    from_account: auto_top_off.dc_account,
    from_hnt_account: auto_top_off.hnt_account,
    hnt_account: auto_top_off.hnt_account,
    hnt_price_oracle: HNT_PRICE_ORACLE,
    escrow_account: auto_top_off.escrow_account,
    circuit_breaker: auto_top_off.circuit_breaker,
    associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
    system_program: system_program::ID,
    circuit_breaker_program: circuit_breaker::ID,
    data_credits_program: data_credits::ID,
    instruction_sysvar: IX_ID,
  }
  .to_account_metas(None);

  let top_off_ix = anchor_lang::solana_program::instruction::Instruction {
    program_id: crate::ID,
    accounts: distribute_accounts,
    data: crate::instruction::TopOffDcV0 {}.data(),
  };

  // Compile the transaction (no signers, just the instruction)
  let compiled_tx = compile_transaction_efficient(vec![top_off_ix], vec![])?;
  Ok(compiled_tx)
}

pub fn get_task_ix_hnt(
  auto_top_off_key: Pubkey,
  auto_top_off: &AutoTopOffV0,
) -> Result<CompiledTransactionV0> {
  // Construct the transaction to call top_off_hnt_v0 on this program
  // Generate custom signer for DCA operations
  let (dca_custom_signer, bump) = Pubkey::find_program_address(
    &[
      b"custom",
      auto_top_off.task_queue.key().as_ref(),
      b"dca_swap_payer",
    ],
    &tuktuk::ID,
  );

  let dca = Pubkey::find_program_address(
    &[
      b"dca",
      auto_top_off_key.as_ref(),
      auto_top_off.dca_mint.as_ref(),
      auto_top_off.hnt_mint.as_ref(),
      0_u16.to_le_bytes().as_ref(),
    ],
    &tuktuk_dca::ID,
  )
  .0;
  let hnt_accounts = crate::__client_accounts_top_off_hnt_v0::TopOffHntV0 {
    auto_top_off: auto_top_off_key,
    task_queue: auto_top_off.task_queue,
    hnt_account: auto_top_off.hnt_account,
    hnt_mint: auto_top_off.hnt_mint,
    dca_mint: auto_top_off.dca_mint,
    dca_mint_account: auto_top_off.dca_mint_account,
    hnt_price_oracle: auto_top_off.hnt_price_oracle,
    dca_input_price_oracle: auto_top_off.dca_input_price_oracle,
    dca,
    dca_input_account: Pubkey::find_program_address(
      &[
        dca.as_ref(),
        spl_token::ID.as_ref(),
        auto_top_off.dca_mint.as_ref(),
      ],
      &associated_token::ID,
    )
    .0,
    dca_destination_token_account: auto_top_off.hnt_account,
    associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
    token_program: spl_token::ID,
    system_program: system_program::ID,
    tuktuk_dca_program: tuktuk_dca::ID,
    instruction_sysvar: IX_ID,
    dca_custom_signer,
  }
  .to_account_metas(None);

  let top_off_ix = anchor_lang::solana_program::instruction::Instruction {
    program_id: crate::ID,
    accounts: hnt_accounts,
    data: crate::instruction::TopOffHntV0 {}.data(),
  };

  // Compile the transaction (no signers, just the instruction)
  let compiled_tx = compile_transaction_efficient(
    vec![top_off_ix],
    vec![vec![
      b"dca_swap_payer".to_vec(),
      bump.to_le_bytes().to_vec(),
    ]],
  )?;
  Ok(compiled_tx)
}

pub fn compile_transaction_efficient(
  instructions: Vec<Instruction>,
  signer_seeds: Vec<Vec<Vec<u8>>>,
) -> Result<CompiledTransactionV0> {
  // Pre-calculate maximum possible accounts to minimize HashMap reallocations
  let max_accounts = instructions.len()
    + instructions
      .iter()
      .map(|ix| ix.accounts.len())
      .sum::<usize>();
  let mut pubkeys_to_metadata: HashMap<Pubkey, AccountMeta> = HashMap::with_capacity(max_accounts);

  // Process all instructions to build metadata
  for ix in &instructions {
    pubkeys_to_metadata
      .entry(ix.program_id)
      .or_insert(AccountMeta {
        pubkey: ix.program_id,
        is_signer: false,
        is_writable: false,
      });

    for key in &ix.accounts {
      let entry = pubkeys_to_metadata
        .entry(key.pubkey)
        .or_insert(AccountMeta {
          is_signer: false,
          is_writable: false,
          pubkey: key.pubkey,
        });
      entry.is_writable |= key.is_writable;
      entry.is_signer |= key.is_signer;
    }
  }

  // Extract and sort accounts in-place to avoid cloning
  let mut sorted_accounts: Vec<(Pubkey, AccountMeta)> = pubkeys_to_metadata.into_iter().collect();
  sorted_accounts.sort_unstable_by(|a, b| {
    // Compare accounts based on priority: writable signers > readonly signers > writable > readonly
    fn get_priority(meta: &AccountMeta) -> u8 {
      match (meta.is_signer, meta.is_writable) {
        (true, true) => 0,   // Writable signer: highest priority
        (true, false) => 1,  // Readonly signer
        (false, true) => 2,  // Writable non-signer
        (false, false) => 3, // Readonly non-signer: lowest priority
      }
    }

    get_priority(&a.1).cmp(&get_priority(&b.1))
  });

  // Count different types of accounts in a single pass
  let mut num_rw_signers = 0u8;
  let mut num_ro_signers = 0u8;
  let mut num_rw = 0u8;

  for (_, metadata) in &sorted_accounts {
    if metadata.is_signer && metadata.is_writable {
      num_rw_signers += 1;
    } else if metadata.is_signer && !metadata.is_writable {
      num_ro_signers += 1;
    } else if metadata.is_writable {
      num_rw += 1;
    }
  }

  // Pre-allocate compiled instructions with exact capacity
  let mut compiled_instructions: Vec<CompiledInstructionV0> =
    Vec::with_capacity(instructions.len());

  // Build minimal lookup map and extract pubkeys in one pass
  let account_count = sorted_accounts.len();
  let mut accounts_to_index: HashMap<Pubkey, u8> = HashMap::with_capacity(account_count);
  let mut account_pubkeys: Vec<Pubkey> = Vec::with_capacity(account_count);

  for (i, (pubkey, _)) in sorted_accounts.iter().enumerate() {
    accounts_to_index.insert(*pubkey, i as u8);
    account_pubkeys.push(*pubkey);
  }

  // Compile instructions with pre-allocated capacity
  for ix in &instructions {
    let program_id_index = accounts_to_index[&ix.program_id];

    let mut account_indices = Vec::with_capacity(ix.accounts.len());
    for account in &ix.accounts {
      account_indices.push(accounts_to_index[&account.pubkey]);
    }

    compiled_instructions.push(CompiledInstructionV0 {
      program_id_index,
      accounts: account_indices,
      data: ix.data.clone(),
    });
  }

  Ok(CompiledTransactionV0 {
    num_ro_signers,
    num_rw_signers,
    num_rw,
    instructions: compiled_instructions,
    signer_seeds,
    accounts: account_pubkeys,
  })
}

pub fn get_next_time(auto_top_off: &AutoTopOffV0) -> Result<i64> {
  let schedule_str_raw = String::from_utf8(auto_top_off.schedule.to_vec()).unwrap();
  let schedule = Schedule::from_str(schedule_str_raw.trim_matches(char::from(0)))
    .map_err(|_| crate::errors::ErrorCode::InvalidSchedule)?;
  let ts = Clock::get().unwrap().unix_timestamp;
  let now = &DateTime::<Utc>::from_naive_utc_and_offset(
    DateTime::from_timestamp(ts, 0).unwrap().naive_utc(),
    Utc,
  );
  Ok(
    schedule
      .after(now)
      .next()
      .ok_or(crate::errors::ErrorCode::InvalidSchedule)?
      .timestamp(),
  )
}

pub fn schedule_impl(ctx: &mut ScheduleTaskV0, args: ScheduleTaskArgsV0) -> Result<()> {
  let auto_top_off_key = ctx.auto_top_off.key();
  let mut auto_top_off = ctx.auto_top_off.load_mut()?;
  let next_time = get_next_time(&auto_top_off)?;
  auto_top_off.next_task = ctx.task.key();
  auto_top_off.next_hnt_task = ctx.hnt_task.key();

  // Switch to immutable borrow so we can cpi
  drop(auto_top_off);
  let auto_top_off = ctx.auto_top_off.load()?;

  // Schedule pyth oracle task (runs 60 seconds before DC topoff)
  let queue_authority_bump = auto_top_off.queue_authority_bump;
  let seeds: &[&[&[u8]]] = &[queue_authority_seeds!(queue_authority_bump)];
  let payer = ctx.payer.to_account_info();
  let queue_authority = ctx.queue_authority.to_account_info();
  let task_queue_authority = ctx.task_queue_authority.to_account_info();
  let task_queue = ctx.task_queue.to_account_info();
  let system_program = ctx.system_program.to_account_info();

  //   let heap_start = unsafe { A.pos() };
  //   msg!("heap ptr pre compile dc: {:?}", heap_start);
  let compiled_tx_dc = get_task_ix_dc(auto_top_off_key, &auto_top_off)?;
  //   let heap_start = unsafe { A.pos() };
  //   msg!("heap ptr post compile dc: {:?}", heap_start);
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: payer.clone(),
        queue_authority: queue_authority.clone(),
        task_queue_authority: task_queue_authority.clone(),
        task_queue: task_queue.clone(),
        task: ctx.task.to_account_info(),
        system_program: system_program.clone(),
      },
      seeds,
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(next_time),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx_dc),
      crank_reward: None,
      free_tasks: 1, // Next DC topoff
      id: args.task_id,
      description: format!("topoff dc {}", &auto_top_off_key.to_string()[..(32 - 14)]),
    },
  )?;

  //   let heap_start = unsafe { A.pos() };
  //   msg!("heap ptr pre compile hnt: {:?}", heap_start);
  let compiled_tx_hnt = get_task_ix_hnt(auto_top_off_key, &auto_top_off)?;
  //   let heap_start = unsafe { A.pos() };
  //   msg!("heap ptr post compile hnt: {:?}", heap_start);
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer,
        queue_authority,
        task_queue_authority,
        task_queue,
        task: ctx.hnt_task.to_account_info(),
        system_program,
      },
      seeds,
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(next_time),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx_hnt),
      crank_reward: None,
      free_tasks: 2, // Next HNT topoff and the DCA generated by the HNT topoff
      id: args.hnt_task_id,
      description: format!("topoff hnt {}", &auto_top_off_key.to_string()[..(32 - 15)]),
    },
  )?;
  Ok(())
}

pub fn handler(ctx: Context<ScheduleTaskV0>, args: ScheduleTaskArgsV0) -> Result<()> {
  let ctx = ctx.accounts;
  schedule_impl(ctx, args)
}
