use anchor_lang::prelude::*;
use helium_sub_daos::helium_sub_daos::accounts::{DaoV0, SubDaoV0};
use tuktuk_program::TaskQueueV0;

declare_id!("EmtovPSZEHXavXT6cpZZ8vvvsudnkeFcK7Y2k8fKEoJS");

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

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (EPOCH_LENGTH)).try_into().unwrap()
}

#[program]
pub mod hpl_crons {
  use std::str::FromStr;

  use anchor_lang::{
    solana_program::{instruction::Instruction, system_program},
    InstructionData,
  };
  use helium_sub_daos::helium_sub_daos::types::CalculateUtilityScoreArgsV0;
  use tuktuk_program::{
    compile_transaction,
    tuktuk::{
      cpi::{accounts::QueueTaskV0, queue_task_v0},
      types::TriggerV0,
    },
    types::QueueTaskArgsV0,
    write_return_tasks::{write_return_tasks, AccountWithSeeds, PayerInfo, WriteReturnTasksArgs},
    RunTaskReturnV0, TaskReturnV0, TransactionSourceV0,
  };

  use super::*;

  pub fn queue_daily_tasks(ctx: Context<QueueDailyTasks>) -> Result<()> {
    let circuit_breaker_program =
      Pubkey::from_str("circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g").unwrap();
    let sub_daos = vec![ctx.accounts.iot_sub_dao, ctx.accounts.mobile_sub_dao];
    // This should be running an hour before the epoch ends, so what is now the current epoch is actually the previous epoch
    let prev_epoch = current_epoch(Clock::get().unwrap().unix_timestamp);
    let curr_epoch = prev_epoch + 1;
    let prev_dao_epoch_info = Pubkey::find_program_address(
      &[
        "dao_epoch_info".as_bytes(),
        ctx.accounts.dao.key().as_ref(),
        &prev_epoch.to_le_bytes(),
      ],
      &helium_sub_daos::ID,
    )
    .0;
    let dao_epoch_info = Pubkey::find_program_address(
      &[
        "dao_epoch_info".as_bytes(),
        ctx.accounts.dao.key().as_ref(),
        &curr_epoch.to_le_bytes(),
      ],
      &helium_sub_daos::ID,
    )
    .0;
    let hnt_circuit_breaker = Pubkey::find_program_address(
      &[
        "mint_windowed_breaker".as_bytes(),
        ctx.accounts.dao.hnt_mint.key().as_ref(),
      ],
      &circuit_breaker_program,
    )
    .0;

    let sub_dao_ixs = sub_daos.iter().map(|sub_dao| {
      let sub_dao_epoch_info = Pubkey::find_program_address(
        &[
          "sub_dao_epoch_info".as_bytes(),
          sub_dao.key().as_ref(),
          &curr_epoch.to_le_bytes(),
        ],
        &helium_sub_daos::ID,
      )
      .0;

      let prev_sub_dao_epoch_info = Pubkey::find_program_address(
        &[
          "sub_dao_epoch_info".as_bytes(),
          sub_dao.key().as_ref(),
          &prev_epoch.to_le_bytes(),
        ],
        &helium_sub_daos::ID,
      )
      .0;
      let calculate = Instruction {
        program_id: helium_sub_daos::ID,
        accounts: helium_sub_daos::helium_sub_daos::client::accounts::CalculateUtilityScoreV0 {
          payer: ctx.accounts.payer.key(),
          registrar: ctx.accounts.dao.registrar,
          dao: ctx.accounts.dao.key(),
          hnt_mint: ctx.accounts.dao.hnt_mint,
          sub_dao: sub_dao.key(),
          prev_dao_epoch_info,
          dao_epoch_info,
          sub_dao_epoch_info,
          system_program: system_program::ID,
          token_program: spl_token::ID,
          circuit_breaker_program,
          prev_sub_dao_epoch_info,
        }
        .to_account_metas(None)
        .to_vec(),
        data: helium_sub_daos::helium_sub_daos::client::args::CalculateUtilityScoreV0 {
          args: CalculateUtilityScoreArgsV0 { epoch: prev_epoch },
        }
        .data(),
      };
      let issue = Instruction {
        program_id: helium_sub_daos::ID,
        accounts: helium_sub_daos::helium_sub_daos::client::accounts::IssueRewardsV0 {
          dao: ctx.accounts.dao.key(),
          hnt_mint: ctx.accounts.dao.hnt_mint,
          sub_dao: sub_dao.key(),
          dao_epoch_info,
          sub_dao_epoch_info,
          system_program: system_program::ID,
          token_program: spl_token::ID,
          circuit_breaker_program,
          prev_sub_dao_epoch_info,
          hnt_circuit_breaker,
          dnt_mint: sub_dao.dnt_mint,
          treasury: sub_dao.treasury,
          rewards_escrow: ctx.accounts.dao.rewards_escrow,
          delegator_pool: ctx.accounts.dao.delegator_pool,
        }
        .to_account_metas(None)
        .to_vec(),
        data: helium_sub_daos::helium_sub_daos::client::args::CalculateUtilityScoreV0 {
          args: CalculateUtilityScoreArgsV0 { epoch: prev_epoch },
        }
        .data(),
      };
      (calculate, issue)
    });
    let (compiled_tx, _) = compile_transaction(
      vec![Instruction {
        program_id: crate::ID,
        accounts: crate::__cpi_client_accounts_recurring_task::RecurringTask {
          system_program: ctx.accounts.system_program.to_account_info(),
        }
        .to_account_metas(None)
        .to_vec(),
        data: crate::instruction::RecurringTask.data(),
      }],
      vec![],
    )
    .unwrap();

    msg!("Rescheduling task via return account");
    let return_accounts = write_return_tasks(WriteReturnTasksArgs {
      program_id: crate::ID,
      payer_info: PayerInfo::SystemPayer {
        account_info: ctx.accounts.queue_authority.to_account_info(),
        seeds: vec![b"queue_authority".to_vec(), vec![ctx.bumps.queue_authority]],
      },
      accounts: vec![AccountWithSeeds {
        account: ctx.accounts.task_return_account.to_account_info(),
        seeds: vec![
          b"task_return_account".to_vec(),
          vec![ctx.bumps.task_return_account],
        ],
      }],
      system_program: ctx.accounts.system_program.to_account_info(),
      tasks: (0..15).map(|_| TaskReturnV0 {
        trigger: TriggerV0::Now,
        transaction: TransactionSourceV0::CompiledV0(compiled_tx.clone()),
        crank_reward: None,
        free_tasks: 1,
      }),
    })?
    .used_accounts;
    Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: return_accounts,
    })
  }
}

#[derive(Accounts)]
pub struct QueueDailyTasks<'info> {
  /// CHECK: This account needs to be funded to pay for the cron PDA
  #[account(
        mut,
        seeds = [b"custom", task_queue.key().as_ref(), b"helium"],
        seeds::program = tuktuk_program::ID,
        bump,
  )]
  pub payer: AccountInfo<'info>,
  pub dao: Account<'info, DaoV0>,
  pub iot_sub_dao: Account<'info, SubDaoV0>,
  pub mobile_sub_dao: Account<'info, SubDaoV0>,
  pub cron_pda: AccountInfo<'info>,
  pub task_queue: Account<'info, TaskQueueV0>,
  pub system_program: Program<'info, System>,
}
