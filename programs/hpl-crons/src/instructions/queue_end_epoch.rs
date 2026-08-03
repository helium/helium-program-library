use std::cmp::max;

use anchor_lang::{prelude::*, system_program, InstructionData};
use helium_sub_daos::{
  accounts::CalculateUtilityScoreV0,
  instruction::IssueRewardsV0,
  supplement::{COUNCIL_FANOUT_TOKEN_ACCOUNT, SUPPLEMENT_VAULT_TOKEN_ACCOUNT},
  CalculateUtilityScoreArgsV0, DaoV0, IssueRewardsArgsV0, SubDaoV0,
};
use spl_token::solana_program::instruction::{AccountMeta, Instruction};
use tuktuk_program::{
  compile_transaction,
  write_return_tasks::{write_return_tasks, AccountWithSeeds, PayerInfo, WriteReturnTasksArgs},
  RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0,
};

use crate::{hpl_crons::CIRCUIT_BREAKER_PROGRAM, EpochTrackerV0, EPOCH_LENGTH};

/// A HIP 149 supplement destination to forward into `issue_rewards_v0`, or `None` while the
/// constant still holds its pre-activation placeholder (the system program id, which is also
/// `Pubkey::default()`).
fn supplement_account(configured: Pubkey) -> Option<Pubkey> {
  (configured != Pubkey::default()).then_some(configured)
}

#[derive(Accounts)]
pub struct QueueEndEpoch<'info> {
  /// CHECK: This account needs to be funded to pay for the cron PDA
  #[account(
    mut,
    seeds = [b"custom", task_queue.key().as_ref(), b"helium"],
    seeds::program = tuktuk_program::tuktuk::ID,
    bump,
  )]
  pub payer: Signer<'info>,
  #[account(
    mut,
    seeds = [b"epoch_tracker", dao.key().as_ref()],
    bump = epoch_tracker.bump_seed,
  )]
  pub epoch_tracker: Box<Account<'info, EpochTrackerV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  pub iot_sub_dao: Box<Account<'info, SubDaoV0>>,
  pub mobile_sub_dao: Box<Account<'info, SubDaoV0>>,
  /// CHECK: The HNT/USD Pyth price account, forwarded into each
  /// calculate_utility_score_v0 for the HIP 149 backstop. Its feed id and
  /// verification level are validated by that instruction's constraints.
  pub hnt_price_oracle: UncheckedAccount<'info>,
  /// CHECK: We init this when writing
  #[account(
    mut,
    seeds = [b"task_return_account"],
    bump,
  )]
  pub task_return_account: AccountInfo<'info>,
  /// CHECK: Just used for key
  #[account(constraint = *task_queue.owner == tuktuk_program::tuktuk::ID)]
  pub task_queue: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
}

fn sub_dao_epoch_info_pda(sub_dao: &Pubkey, epoch: u64) -> Pubkey {
  Pubkey::find_program_address(
    &[
      b"sub_dao_epoch_info",
      sub_dao.as_ref(),
      &epoch.to_le_bytes(),
    ],
    &helium_sub_daos::ID,
  )
  .0
}

/// One sub-DAO's contribution to the end-epoch instruction set.
pub struct SubDaoInputs {
  pub key: Pubkey,
  pub dnt_mint: Pubkey,
  pub treasury: Pubkey,
}

/// The plain values the end-epoch instruction set is built from, lifted out of the Anchor
/// context so it can be built, and its allocation cost measured, without one.
pub struct EndEpochInputs {
  pub payer: Pubkey,
  pub registrar: Pubkey,
  pub dao: Pubkey,
  pub hnt_mint: Pubkey,
  pub rewards_escrow: Pubkey,
  pub delegator_pool: Pubkey,
  pub hnt_price_oracle: Pubkey,
  pub mobile_sub_dao: Pubkey,
  /// IoT first, then Mobile, matching the order the handler passes them.
  pub sub_daos: [SubDaoInputs; 2],
  pub prev_epoch: u64,
  pub curr_epoch: u64,
}

/// Builds the calculate/issue/no-emit instruction set the end-epoch task executes.
///
/// Separate from the handler because its allocation cost is what has to stay inside the 32KB
/// heap, and measuring that needs to be cheaper than standing up a localnet.
pub fn end_epoch_ixs(inputs: &EndEpochInputs) -> Vec<Instruction> {
  let EndEpochInputs {
    payer,
    registrar,
    dao: dao_key,
    hnt_mint,
    rewards_escrow,
    delegator_pool,
    hnt_price_oracle,
    mobile_sub_dao,
    sub_daos,
    prev_epoch,
    curr_epoch,
  } = inputs;
  let (prev_epoch, curr_epoch) = (*prev_epoch, *curr_epoch);
  let (dao_key, hnt_mint) = (*dao_key, *hnt_mint);

  let dao_epoch_info_pda = |epoch: u64| {
    Pubkey::find_program_address(
      &[b"dao_epoch_info", dao_key.as_ref(), &epoch.to_le_bytes()],
      &helium_sub_daos::ID,
    )
    .0
  };
  let prev_dao_epoch_info = dao_epoch_info_pda(prev_epoch);
  let dao_epoch_info = dao_epoch_info_pda(curr_epoch);

  let hnt_circuit_breaker = Pubkey::find_program_address(
    &[b"mint_windowed_breaker", hnt_mint.as_ref()],
    &CIRCUIT_BREAKER_PROGRAM,
  )
  .0;
  let not_emitted_counter =
    Pubkey::find_program_address(&[b"not_emitted_counter", hnt_mint.as_ref()], &no_emit::ID).0;

  let calc_args = helium_sub_daos::instruction::CalculateUtilityScoreV0 {
    args: CalculateUtilityScoreArgsV0 { epoch: curr_epoch },
  };
  let reward_args = IssueRewardsV0 {
    args: IssueRewardsArgsV0 { epoch: curr_epoch },
  };

  let mut ixs = Vec::with_capacity(5);

  // HIP 149 backstop: every calculate_utility_score_v0 (both the IoT and Mobile pass)
  // reads the Mobile sub-DAO's current- and previous-epoch info to size the deployer
  // top-up, so total_rewards is independent of sub-DAO ordering. These are passed as
  // read-only remaining accounts and located on-chain by PDA.
  let mobile_curr_epoch_info = sub_dao_epoch_info_pda(mobile_sub_dao, curr_epoch);
  let mobile_prev_epoch_info = sub_dao_epoch_info_pda(mobile_sub_dao, prev_epoch);

  for sub_dao in sub_daos.iter() {
    // Sized for the struct's own accounts plus the two Mobile epoch infos appended below.
    // Pushing onto the Vec that to_account_metas returns at exact capacity reallocs and copies
    // the whole thing, which measures 2,040 bytes per instruction against 1,530 pre-sized. On a
    // bump-allocated heap that copy is never reclaimed.
    let base = CalculateUtilityScoreV0 {
      payer: *payer,
      registrar: *registrar,
      dao: dao_key,
      hnt_mint,
      sub_dao: sub_dao.key,
      prev_dao_epoch_info,
      dao_epoch_info,
      sub_dao_epoch_info: sub_dao_epoch_info_pda(&sub_dao.key, curr_epoch),
      system_program: system_program::ID,
      token_program: spl_token::ID,
      circuit_breaker_program: CIRCUIT_BREAKER_PROGRAM,
      prev_sub_dao_epoch_info: sub_dao_epoch_info_pda(&sub_dao.key, prev_epoch),
      not_emitted_counter,
      no_emit_program: no_emit::ID,
      hnt_price_oracle: Some(*hnt_price_oracle),
    }
    .to_account_metas(None);
    let mut accounts = Vec::with_capacity(base.len() + 2);
    accounts.extend(base);
    accounts.push(AccountMeta::new_readonly(mobile_curr_epoch_info, false));
    accounts.push(AccountMeta::new_readonly(mobile_prev_epoch_info, false));
    ixs.push(Instruction {
      program_id: helium_sub_daos::ID,
      accounts,
      data: calc_args.data(),
    });
  }

  for sub_dao in sub_daos.iter() {
    ixs.push(Instruction {
      program_id: helium_sub_daos::ID,
      accounts: helium_sub_daos::accounts::IssueRewardsV0 {
        dao: dao_key,
        hnt_mint,
        sub_dao: sub_dao.key,
        dao_epoch_info,
        sub_dao_epoch_info: sub_dao_epoch_info_pda(&sub_dao.key, curr_epoch),
        system_program: system_program::ID,
        token_program: spl_token::ID,
        circuit_breaker_program: CIRCUIT_BREAKER_PROGRAM,
        prev_sub_dao_epoch_info: sub_dao_epoch_info_pda(&sub_dao.key, prev_epoch),
        hnt_circuit_breaker,
        dnt_mint: sub_dao.dnt_mint,
        treasury: sub_dao.treasury,
        rewards_escrow: *rewards_escrow,
        delegator_pool: *delegator_pool,
        // HIP 149 Decision 2 supplement vault + Decision 4 Council fanout, read from the
        // helium-sub-daos constants so the two programs cannot disagree about the destinations.
        // `issue_rewards_v0` requires them only while a supplement window is open, but a task
        // is queued one epoch before it runs, so window state at queue time says nothing about
        // window state at execution: both are forwarded whenever the constants are real, or the
        // first epoch of a window would settle against a task built without them and fail
        // closed, stopping the self-rescheduling chain.
        //
        // A placeholder constant is withheld instead, because Anchor deserializes a forwarded
        // account as a `TokenAccount` regardless of window state and the placeholder is the
        // system program id.
        supplement_vault: supplement_account(SUPPLEMENT_VAULT_TOKEN_ACCOUNT),
        council_vault: supplement_account(COUNCIL_FANOUT_TOKEN_ACCOUNT),
      }
      .to_account_metas(None),
      data: reward_args.data(),
    });
  }

  let no_emit_wallet = Pubkey::find_program_address(&[b"not_emitted"], &no_emit::ID).0;
  ixs.push(Instruction {
    program_id: no_emit::ID,
    accounts: no_emit::accounts::NoEmitV0 {
      system_program: system_program::ID,
      payer: *payer,
      no_emit_wallet,
      not_emitted_counter,
      token_account: spl_associated_token_account::get_associated_token_address(
        &no_emit_wallet,
        &hnt_mint,
      ),
      mint: hnt_mint,
      token_program: spl_token::ID,
    }
    .to_account_metas(None),
    data: no_emit::instruction::NoEmitV0.data(),
  });

  ixs
}

pub fn handler(ctx: Context<QueueEndEpoch>) -> Result<RunTaskReturnV0> {
  let prev_epoch = ctx.accounts.epoch_tracker.epoch;
  let curr_epoch = prev_epoch + 1;
  ctx.accounts.epoch_tracker.epoch = curr_epoch;

  msg!("Queueing epoch {}", curr_epoch);

  let ixs = end_epoch_ixs(&EndEpochInputs {
    payer: ctx.accounts.payer.key(),
    registrar: ctx.accounts.dao.registrar,
    dao: ctx.accounts.dao.key(),
    hnt_mint: ctx.accounts.dao.hnt_mint,
    rewards_escrow: ctx.accounts.dao.rewards_escrow,
    delegator_pool: ctx.accounts.dao.delegator_pool,
    hnt_price_oracle: ctx.accounts.hnt_price_oracle.key(),
    mobile_sub_dao: ctx.accounts.mobile_sub_dao.key(),
    sub_daos: [
      SubDaoInputs {
        key: ctx.accounts.iot_sub_dao.key(),
        dnt_mint: ctx.accounts.iot_sub_dao.dnt_mint,
        treasury: ctx.accounts.iot_sub_dao.treasury,
      },
      SubDaoInputs {
        key: ctx.accounts.mobile_sub_dao.key(),
        dnt_mint: ctx.accounts.mobile_sub_dao.dnt_mint,
        treasury: ctx.accounts.mobile_sub_dao.treasury,
      },
    ],
    prev_epoch,
    curr_epoch,
  });

  // This handler runs inside tuktuk's `run_task` under a 32KB heap, which the two compiled
  // transactions below dominate, and it has overflowed in production once already. The SBF
  // heap is a bump allocator whose `dealloc` is a no-op, so what has to stay bounded is the
  // total bytes ever allocated, not the peak live: dropping a value early buys nothing, and
  // only never allocating does. Hence rebuilding the seeds rather than cloning them, and
  // moving the account metas rather than copying them.
  let bump = ctx.bumps.payer;
  let seeds = || vec![vec![b"helium".to_vec(), bump.to_le_bytes().to_vec()]];
  let (compiled_tx, _) = compile_transaction(ixs, seeds())?;

  let reschedule_ix = Instruction {
    program_id: crate::ID,
    accounts: crate::__cpi_client_accounts_queue_end_epoch::QueueEndEpoch {
      system_program: ctx.accounts.system_program.to_account_info(),
      payer: ctx.accounts.payer.to_account_info(),
      dao: ctx.accounts.dao.to_account_info(),
      iot_sub_dao: ctx.accounts.iot_sub_dao.to_account_info(),
      mobile_sub_dao: ctx.accounts.mobile_sub_dao.to_account_info(),
      hnt_price_oracle: ctx.accounts.hnt_price_oracle.to_account_info(),
      task_return_account: ctx.accounts.task_return_account.to_account_info(),
      task_queue: ctx.accounts.task_queue.to_account_info(),
      epoch_tracker: ctx.accounts.epoch_tracker.to_account_info(),
    }
    .to_account_metas(None),
    data: crate::instruction::QueueEndEpoch.data(),
  };
  let (compiled_reschedule_tx, _) = compile_transaction(vec![reschedule_ix], seeds()).unwrap();

  let end_of_epoch_trigger = TriggerV0::Timestamp(max(
    Clock::get()?.unix_timestamp,
    ((curr_epoch + 1) * EPOCH_LENGTH).try_into().unwrap(),
  ));

  let return_accounts = write_return_tasks(WriteReturnTasksArgs {
    program_id: crate::ID,
    payer_info: PayerInfo::Signer(ctx.accounts.payer.to_account_info()),
    accounts: vec![AccountWithSeeds {
      account: ctx.accounts.task_return_account.to_account_info(),
      seeds: vec![
        b"task_return_account".to_vec(),
        vec![ctx.bumps.task_return_account],
      ],
    }],
    system_program: ctx.accounts.system_program.to_account_info(),
    tasks: vec![
      // At the end of each epoch, schedule the next epoch end and reschedule the cron
      TaskReturnV0 {
        trigger: end_of_epoch_trigger,
        transaction: TransactionSourceV0::CompiledV0(compiled_tx),
        crank_reward: None,
        free_tasks: 0,
        description: format!("end epoch {}", curr_epoch),
      },
      TaskReturnV0 {
        trigger: end_of_epoch_trigger,
        transaction: TransactionSourceV0::CompiledV0(compiled_reschedule_tx),
        crank_reward: None,
        free_tasks: 2,
        description: format!("queue end epoch {}", curr_epoch),
      },
    ]
    .into_iter(),
  })?
  .used_accounts;
  Ok(RunTaskReturnV0 {
    tasks: vec![],
    accounts: return_accounts,
  })
}

/// Tallies every allocation on the calling thread, mirroring how the SBF heap behaves: its
/// `dealloc` is a no-op, so a program is bounded by the total bytes it ever allocates rather
/// than by its peak live set. Freeing is therefore deliberately not subtracted here.
///
/// The counter is thread-local because the test harness runs each test on its own thread, and a
/// process-wide counter would pick up every other test's allocations. `Cell` with a const
/// initialiser keeps the TLS access itself allocation-free.
#[cfg(test)]
mod alloc_tally {
  use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
  };

  thread_local! {
    static BYTES: Cell<usize> = const { Cell::new(0) };
  }

  pub struct Tallying;

  unsafe impl GlobalAlloc for Tallying {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
      BYTES.with(|b| b.set(b.get().saturating_add(layout.size())));
      System.alloc(layout)
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
      System.dealloc(ptr, layout)
    }
  }

  /// Total bytes allocated on this thread while `f` ran.
  pub fn bytes_allocated_by<T>(f: impl FnOnce() -> T) -> usize {
    let before = BYTES.with(|b| b.get());
    let out = f();
    let after = BYTES.with(|b| b.get());
    drop(out);
    after - before
  }
}

#[cfg(test)]
#[global_allocator]
static TALLYING_ALLOCATOR: alloc_tally::Tallying = alloc_tally::Tallying;

#[cfg(test)]
mod tests {
  use super::*;

  fn test_inputs() -> EndEpochInputs {
    EndEpochInputs {
      payer: Pubkey::new_unique(),
      registrar: Pubkey::new_unique(),
      dao: Pubkey::new_unique(),
      hnt_mint: Pubkey::new_unique(),
      rewards_escrow: Pubkey::new_unique(),
      delegator_pool: Pubkey::new_unique(),
      hnt_price_oracle: Pubkey::new_unique(),
      mobile_sub_dao: Pubkey::new_unique(),
      sub_daos: [
        SubDaoInputs {
          key: Pubkey::new_unique(),
          dnt_mint: Pubkey::new_unique(),
          treasury: Pubkey::new_unique(),
        },
        SubDaoInputs {
          key: Pubkey::new_unique(),
          dnt_mint: Pubkey::new_unique(),
          treasury: Pubkey::new_unique(),
        },
      ],
      prev_epoch: 20_667,
      curr_epoch: 20_668,
    }
  }

  fn build_and_compile(inputs: &EndEpochInputs) {
    let ixs = end_epoch_ixs(inputs);
    let seeds = vec![vec![b"helium".to_vec(), 255u8.to_le_bytes().to_vec()]];
    compile_transaction(ixs, seeds).expect("compile end-epoch transaction");
  }

  /// The end-epoch task has already exhausted the 32KB SBF heap in production, and the localnet
  /// regression test only reports that after an anchor build and a running validator. This runs
  /// in milliseconds and yields a number, so growth is visible while there is still headroom
  /// rather than only once it has been spent.
  ///
  /// The heap is shared rather than ours alone: `run_task_v0` spends part of it deserializing
  /// the task and building account metas before this handler is reached at CPI depth 2, so the
  /// figure below is a fraction of the real budget, not all of it. It is also calibrated against
  /// the host allocator, which is not the SBF one, so treat it as a drift detector on the delta
  /// rather than a literal 32KB assertion. The localnet test remains the ground truth.
  #[test]
  fn end_epoch_instruction_set_stays_within_its_allocation_budget() {
    // Measured at 24,104 bytes carrying both supplement destinations, against 24,464 on the
    // pre-HIP-149 baseline: pre-sizing the metas Vec more than pays for the 136 bytes the two
    // destinations add. The budget leaves a few hundred bytes: enough that an incidental change
    // does not trip it, tight enough that anything structural does.
    const BUDGET: usize = 24_500;

    let inputs = test_inputs();
    // The first measured region on a thread also captures one-time initialisation, which is
    // worth ~1.5KB here and would make the figure depend on test ordering. Warm it up first.
    build_and_compile(&inputs);

    let bytes = alloc_tally::bytes_allocated_by(|| build_and_compile(&inputs));

    println!("end-epoch instruction set + compile allocated {bytes} bytes");
    assert!(
      bytes <= BUDGET,
      "end-epoch build allocated {bytes} bytes, over the {BUDGET} budget. The SBF heap never \
       reuses freed memory, so this is what the 32KB limit is spent on, and the task has been \
       within ~136 bytes of that limit. Reclaim allocations or reduce what the task carries; \
       shaving incidental clones will not create durable headroom."
    );
  }

  /// Pins what the task actually carries, so a lost account shows up here rather than as a
  /// failed epoch. Five instructions: a calculate and an issue per sub-DAO, plus no-emit.
  #[test]
  fn end_epoch_forwards_both_supplement_destinations() {
    let ixs = end_epoch_ixs(&test_inputs());
    assert_eq!(ixs.len(), 5);

    let issue_ixs: Vec<_> = ixs
      .iter()
      .filter(|ix| {
        ix.data
          == IssueRewardsV0 {
            args: IssueRewardsArgsV0 { epoch: 20_668 },
          }
          .data()
      })
      .collect();
    assert_eq!(issue_ixs.len(), 2);

    for ix in issue_ixs {
      for destination in [SUPPLEMENT_VAULT_TOKEN_ACCOUNT, COUNCIL_FANOUT_TOKEN_ACCOUNT] {
        assert!(
          ix.accounts.iter().any(|a| a.pubkey == destination),
          "issue_rewards_v0 must carry {destination}, or the first epoch of a supplement \
           window settles without it and the cron chain stops"
        );
      }
    }
  }

  #[test]
  fn placeholder_supplement_destination_is_not_forwarded() {
    // Anchor deserializes a forwarded account as a TokenAccount regardless of whether a
    // supplement window is open, so forwarding the pre-activation placeholder would fail
    // every epoch. Pubkey::default() is the system program id the constants ship with.
    assert_eq!(supplement_account(Pubkey::default()), None);
  }

  #[test]
  fn configured_supplement_destination_is_forwarded() {
    let configured = Pubkey::new_unique();
    assert_eq!(supplement_account(configured), Some(configured));
  }
}
