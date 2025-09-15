use std::cmp::max;

use anchor_lang::{prelude::*, system_program, InstructionData};
use helium_sub_daos::{
  accounts::CalculateUtilityScoreV0, instruction::IssueRewardsV0, CalculateUtilityScoreArgsV0,
  DaoV0, IssueRewardsArgsV0, SubDaoV0,
};
use spl_token::solana_program::instruction::Instruction;
use tuktuk_program::{
  compile_transaction,
  write_return_tasks::{write_return_tasks, AccountWithSeeds, PayerInfo, WriteReturnTasksArgs},
  RunTaskReturnV0, TaskQueueV0, TaskReturnV0, TransactionSourceV0, TriggerV0,
};

use crate::{hpl_crons::CIRCUIT_BREAKER_PROGRAM, EpochTrackerV0, EPOCH_LENGTH};

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

pub fn handler(ctx: Context<QueueEndEpoch>) -> Result<RunTaskReturnV0> {
  let sub_daos = [&ctx.accounts.iot_sub_dao, &ctx.accounts.mobile_sub_dao];
  let prev_epoch = ctx.accounts.epoch_tracker.epoch;
  let curr_epoch = prev_epoch + 1;
  ctx.accounts.epoch_tracker.epoch = curr_epoch;

  let dao_key = ctx.accounts.dao.key();
  let prev_dao_epoch_info = Pubkey::find_program_address(
    &[
      b"dao_epoch_info",
      dao_key.as_ref(),
      &prev_epoch.to_le_bytes(),
    ],
    &helium_sub_daos::ID,
  )
  .0;

  let dao_epoch_info = Pubkey::find_program_address(
    &[
      b"dao_epoch_info",
      dao_key.as_ref(),
      &curr_epoch.to_le_bytes(),
    ],
    &helium_sub_daos::ID,
  )
  .0;

  let hnt_mint = ctx.accounts.dao.hnt_mint;
  let hnt_circuit_breaker = Pubkey::find_program_address(
    &[b"mint_windowed_breaker", hnt_mint.as_ref()],
    &CIRCUIT_BREAKER_PROGRAM,
  )
  .0;

  let calc_args = helium_sub_daos::instruction::CalculateUtilityScoreV0 {
    args: CalculateUtilityScoreArgsV0 { epoch: curr_epoch },
  };
  let reward_args = IssueRewardsV0 {
    args: IssueRewardsArgsV0 { epoch: curr_epoch },
  };

  msg!("Queueing epoch {}", curr_epoch);

  let mut ixs = Vec::with_capacity(5);

  // Pre-calculate PDAs for each sub-dao
  let sub_dao_infos: Vec<_> = sub_daos
    .iter()
    .map(|sub_dao| {
      let sub_dao_key = sub_dao.key();
      let prev_sub_dao_epoch_info = Pubkey::find_program_address(
        &[
          b"sub_dao_epoch_info",
          sub_dao_key.as_ref(),
          &prev_epoch.to_le_bytes(),
        ],
        &helium_sub_daos::ID,
      )
      .0;

      let sub_dao_epoch_info = Pubkey::find_program_address(
        &[
          b"sub_dao_epoch_info",
          sub_dao_key.as_ref(),
          &curr_epoch.to_le_bytes(),
        ],
        &helium_sub_daos::ID,
      )
      .0;

      (
        sub_dao,
        sub_dao_key,
        prev_sub_dao_epoch_info,
        sub_dao_epoch_info,
      )
    })
    .collect();

  // Add all calculate instructions
  for (_, sub_dao_key, prev_sub_dao_epoch_info, sub_dao_epoch_info) in sub_dao_infos.iter() {
    ixs.push(Instruction {
      program_id: helium_sub_daos::ID,
      accounts: CalculateUtilityScoreV0 {
        payer: ctx.accounts.payer.key(),
        registrar: ctx.accounts.dao.registrar,
        dao: dao_key,
        hnt_mint,
        sub_dao: *sub_dao_key,
        prev_dao_epoch_info,
        dao_epoch_info,
        sub_dao_epoch_info: *sub_dao_epoch_info,
        system_program: system_program::ID,
        token_program: spl_token::ID,
        circuit_breaker_program: CIRCUIT_BREAKER_PROGRAM,
        prev_sub_dao_epoch_info: *prev_sub_dao_epoch_info,
        not_emitted_counter: Pubkey::find_program_address(
          &[b"not_emitted_counter", hnt_mint.as_ref()],
          &no_emit::ID,
        )
        .0,
        no_emit_program: no_emit::ID,
      }
      .to_account_metas(None),
      data: calc_args.data(),
    });
  }

  // Add all issue instructions
  for (sub_dao, sub_dao_key, prev_sub_dao_epoch_info, sub_dao_epoch_info) in sub_dao_infos.iter() {
    ixs.push(Instruction {
      program_id: helium_sub_daos::ID,
      accounts: helium_sub_daos::accounts::IssueRewardsV0 {
        dao: dao_key,
        hnt_mint,
        sub_dao: *sub_dao_key,
        dao_epoch_info,
        sub_dao_epoch_info: *sub_dao_epoch_info,
        system_program: system_program::ID,
        token_program: spl_token::ID,
        circuit_breaker_program: CIRCUIT_BREAKER_PROGRAM,
        prev_sub_dao_epoch_info: *prev_sub_dao_epoch_info,
        hnt_circuit_breaker,
        dnt_mint: sub_dao.dnt_mint,
        treasury: sub_dao.treasury,
        rewards_escrow: ctx.accounts.dao.rewards_escrow,
        delegator_pool: ctx.accounts.dao.delegator_pool,
      }
      .to_account_metas(None),
      data: reward_args.data(),
    });
  }

  // Add no_emit instruction
  let no_emit_wallet = Pubkey::find_program_address(&[b"not_emitted"], &no_emit::ID).0;
  ixs.push(Instruction {
    program_id: no_emit::ID,
    accounts: no_emit::accounts::NoEmitV0 {
      system_program: ctx.accounts.system_program.key(),
      payer: ctx.accounts.payer.key(),
      no_emit_wallet,
      not_emitted_counter: Pubkey::find_program_address(
        &[b"not_emitted_counter", hnt_mint.as_ref()],
        &no_emit::ID,
      )
      .0,
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

  let bump = ctx.bumps.payer;
  let seeds = vec![vec![b"helium".to_vec(), bump.to_le_bytes().to_vec()]];
  let (compiled_tx, _) = compile_transaction(ixs, seeds.clone())?;

  let reschedule_ix = Instruction {
    program_id: crate::ID,
    accounts: crate::__cpi_client_accounts_queue_end_epoch::QueueEndEpoch {
      system_program: ctx.accounts.system_program.to_account_info(),
      payer: ctx.accounts.payer.to_account_info(),
      dao: ctx.accounts.dao.to_account_info(),
      iot_sub_dao: ctx.accounts.iot_sub_dao.to_account_info(),
      mobile_sub_dao: ctx.accounts.mobile_sub_dao.to_account_info(),
      task_return_account: ctx.accounts.task_return_account.to_account_info(),
      task_queue: ctx.accounts.task_queue.to_account_info(),
      epoch_tracker: ctx.accounts.epoch_tracker.to_account_info(),
    }
    .to_account_metas(None)
    .to_vec(),
    data: crate::instruction::QueueEndEpoch.data(),
  };
  let (compiled_reschedule_tx, _) = compile_transaction(vec![reschedule_ix], seeds).unwrap();

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
        transaction: TransactionSourceV0::CompiledV0(compiled_tx.clone()),
        crank_reward: None,
        free_tasks: 0,
        description: format!("end epoch {}", curr_epoch),
      },
      TaskReturnV0 {
        trigger: end_of_epoch_trigger,
        transaction: TransactionSourceV0::CompiledV0(compiled_reschedule_tx.clone()),
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
