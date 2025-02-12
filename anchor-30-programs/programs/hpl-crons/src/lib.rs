use anchor_lang::prelude::*;
use helium_sub_daos::helium_sub_daos::accounts::{DaoV0, SubDaoV0};
use tuktuk_program::TaskQueueV0;

declare_id!("hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu");

mod no_emit {
  use anchor_lang::{declare_id, declare_program};

  declare_id!("noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv");

  declare_program!(no_emit);
}

mod helium_sub_daos {
  use anchor_lang::{declare_id, declare_program};

  declare_id!("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR");

  declare_program!(helium_sub_daos);
}

const EPOCH_LENGTH: u64 = 60 * 60 * 24;

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (EPOCH_LENGTH as i64)).try_into().unwrap()
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateEpochTrackerArgs {
  pub epoch: Option<u64>,
  pub authority: Option<Pubkey>,
}

#[program]
pub mod hpl_crons {
  use anchor_lang::{
    solana_program::{instruction::Instruction, system_program},
    InstructionData,
  };
  use helium_sub_daos::helium_sub_daos::types::{CalculateUtilityScoreArgsV0, IssueRewardsArgsV0};
  use tuktuk_program::{
    compile_transaction,
    tuktuk::types::TriggerV0,
    write_return_tasks::{write_return_tasks, AccountWithSeeds, PayerInfo, WriteReturnTasksArgs},
    RunTaskReturnV0, TaskReturnV0, TransactionSourceV0,
  };

  use super::*;

  pub const CIRCUIT_BREAKER_PROGRAM: Pubkey =
    pubkey!("circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g");

  pub fn init_epoch_tracker(ctx: Context<InitEpochTracker>) -> Result<()> {
    ctx.accounts.epoch_tracker.set_inner(EpochTrackerV0 {
      dao: ctx.accounts.dao.key(),
      epoch: current_epoch(Clock::get().unwrap().unix_timestamp) - 1,
      bump_seed: ctx.bumps.epoch_tracker,
      authority: ctx.accounts.authority.key(),
    });
    Ok(())
  }

  pub fn update_epoch_tracker(
    ctx: Context<UpdateEpochTracker>,
    args: UpdateEpochTrackerArgs,
  ) -> Result<()> {
    if let Some(epoch) = args.epoch {
      ctx.accounts.epoch_tracker.epoch = epoch;
    }
    if let Some(authority) = args.authority {
      ctx.accounts.epoch_tracker.authority = authority;
    }

    Ok(())
  }

  pub fn queue_end_epoch(ctx: Context<QueueEndEpoch>) -> Result<tuktuk_program::RunTaskReturnV0> {
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

    let calc_args = helium_sub_daos::helium_sub_daos::client::args::CalculateUtilityScoreV0 {
      args: CalculateUtilityScoreArgsV0 { epoch: curr_epoch },
    };
    let reward_args = helium_sub_daos::helium_sub_daos::client::args::IssueRewardsV0 {
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
        accounts: helium_sub_daos::helium_sub_daos::client::accounts::CalculateUtilityScoreV0 {
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
    for (sub_dao, sub_dao_key, prev_sub_dao_epoch_info, sub_dao_epoch_info) in sub_dao_infos.iter()
    {
      ixs.push(Instruction {
        program_id: helium_sub_daos::ID,
        accounts: helium_sub_daos::helium_sub_daos::client::accounts::IssueRewardsV0 {
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
      accounts: no_emit::no_emit::client::accounts::NoEmitV0 {
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
      data: no_emit::no_emit::client::args::NoEmitV0.data(),
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

    let end_of_epoch_trigger =
      TriggerV0::Timestamp(((curr_epoch + 1) * EPOCH_LENGTH).try_into().unwrap());

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
        },
        TaskReturnV0 {
          trigger: end_of_epoch_trigger,
          transaction: TransactionSourceV0::CompiledV0(compiled_reschedule_tx.clone()),
          crank_reward: None,
          free_tasks: 2,
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
}

#[account]
#[derive(Default, InitSpace)]
pub struct EpochTrackerV0 {
  pub authority: Pubkey,
  pub dao: Pubkey,
  pub epoch: u64,
  pub bump_seed: u8,
}

#[derive(Accounts)]
pub struct InitEpochTracker<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    seeds = [b"epoch_tracker", dao.key().as_ref()],
    bump,
    space = 8 + EpochTrackerV0::INIT_SPACE + 60,
  )]
  pub epoch_tracker: Box<Account<'info, EpochTrackerV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  /// CHECK: The authority to set
  pub authority: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateEpochTracker<'info> {
  pub authority: Signer<'info>,
  #[account(mut, has_one = authority)]
  pub epoch_tracker: Box<Account<'info, EpochTrackerV0>>,
}

#[derive(Accounts)]
pub struct QueueEndEpoch<'info> {
  /// CHECK: This account needs to be funded to pay for the cron PDA
  #[account(
    mut,
    seeds = [b"custom", task_queue.key().as_ref(), b"helium"],
    seeds::program = tuktuk_program::ID,
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
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  pub system_program: Program<'info, System>,
}
