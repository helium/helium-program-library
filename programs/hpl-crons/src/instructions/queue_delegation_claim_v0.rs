use std::cmp::max;

use anchor_lang::{
  prelude::*,
  system_program::{self, transfer, Transfer},
  InstructionData,
};
use anchor_spl::token::{Mint, TokenAccount};
use helium_sub_daos::{ClaimRewardsArgsV0, DaoV0, DelegatedPositionV0, SubDaoV0};
use spl_token::solana_program::instruction::Instruction;
use tuktuk_program::{
  compile_transaction,
  write_return_tasks::{write_return_tasks, AccountWithSeeds, PayerInfo, WriteReturnTasksArgs},
  RunTaskReturnV0, TaskQueueV0, TaskReturnV0, TransactionSourceV0, TriggerV0,
};
use voter_stake_registry::state::PositionV0;

use crate::{hpl_crons::CIRCUIT_BREAKER_PROGRAM, DelegationClaimBotV0, EPOCH_LENGTH};

pub const FIFTEEN_MINUTES: i64 = 60 * 15;

#[derive(Accounts)]
pub struct QueueDelegationClaimV0<'info> {
  /// CHECK: Doesn't matter
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  #[account(
    mut,
    has_one = delegated_position,
    has_one = rent_refund,
    has_one = task_queue,
  )]
  pub delegation_claim_bot: Account<'info, DelegationClaimBotV0>,
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
    seeds = [b"custom", task_queue.key().as_ref(), b"position"],
    seeds::program = tuktuk_program::tuktuk::ID,
    bump,
  )]
  pub position_claim_payer: Signer<'info>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    has_one = position,
    has_one = sub_dao,
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(has_one = dao)]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(has_one = hnt_mint)]
  pub dao: Box<Account<'info, DaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    has_one = mint,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  /// CHECK: The authority of the position
  pub position_authority: AccountInfo<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Needed for claim, checked via CPI.
  pub delegator_ata: UncheckedAccount<'info>,
  /// CHECK: We init this when writing
  #[account(
    mut,
    seeds = [b"task_return_account"],
    bump,
  )]
  pub task_return_account: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<QueueDelegationClaimV0>) -> Result<RunTaskReturnV0> {
  if ctx.accounts.delegator_ata.data_is_empty() {
    msg!("User closed their token account, disabling automation");
    ctx
      .accounts
      .delegation_claim_bot
      .close(ctx.accounts.rent_refund.to_account_info())?;
    return Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    });
  }

  let curr_epoch = max(
    ctx.accounts.delegated_position.last_claimed_epoch + 1,
    ctx.accounts.delegation_claim_bot.last_claimed_epoch + 1,
  );
  ctx.accounts.delegation_claim_bot.last_claimed_epoch = curr_epoch;
  let bump = ctx.bumps.payer;
  let seeds = vec![
    vec![b"helium".to_vec(), bump.to_le_bytes().to_vec()],
    vec![
      b"position".to_vec(),
      ctx.bumps.position_claim_payer.to_le_bytes().to_vec(),
    ],
  ];
  let dao_epoch_info = Pubkey::find_program_address(
    &[
      b"dao_epoch_info",
      ctx.accounts.sub_dao.dao.as_ref(),
      &curr_epoch.to_le_bytes(),
    ],
    &helium_sub_daos::ID,
  )
  .0;
  let delegator_pool_circuit_breaker = Pubkey::find_program_address(
    &[
      b"account_windowed_breaker",
      ctx.accounts.dao.delegator_pool.as_ref(),
    ],
    &CIRCUIT_BREAKER_PROGRAM,
  )
  .0;
  let epoch_ts = ((curr_epoch + 1) * EPOCH_LENGTH) as i64;
  let is_expired = epoch_ts > ctx.accounts.delegated_position.expiration_ts;
  if is_expired {
    ctx
      .accounts
      .delegation_claim_bot
      .close(ctx.accounts.rent_refund.to_account_info())?;
    return Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    });
  }
  let ixs = vec![Instruction {
    program_id: helium_sub_daos::ID,
    accounts: helium_sub_daos::accounts::ClaimRewardsV1 {
      dao: ctx.accounts.sub_dao.dao,
      sub_dao: ctx.accounts.sub_dao.key(),
      position: ctx.accounts.position.key(),
      position_token_account: ctx.accounts.position_token_account.key(),
      position_authority: ctx.accounts.position_token_account.owner,
      system_program: system_program::ID,
      token_program: spl_token::ID,
      circuit_breaker_program: CIRCUIT_BREAKER_PROGRAM,
      mint: ctx.accounts.position.mint,
      registrar: ctx.accounts.position.registrar,
      delegated_position: ctx.accounts.delegated_position.key(),
      hnt_mint: ctx.accounts.dao.hnt_mint,
      dao_epoch_info,
      delegator_pool: ctx.accounts.dao.delegator_pool,
      delegator_ata: ctx.accounts.delegator_ata.key(),
      delegator_pool_circuit_breaker,
      vsr_program: voter_stake_registry::ID,
      associated_token_program: spl_associated_token_account::ID,
      payer: ctx.accounts.position_claim_payer.key(),
    }
    .to_account_metas(None),
    data: helium_sub_daos::instruction::ClaimRewardsV1 {
      args: ClaimRewardsArgsV0 { epoch: curr_epoch },
    }
    .data(),
  }];

  let (compiled_tx, _) = compile_transaction(ixs, vec![seeds[1].clone()])?;

  let reschedule_ix = Instruction {
    program_id: crate::ID,
    accounts: crate::__cpi_client_accounts_queue_delegation_claim_v0::QueueDelegationClaimV0 {
      rent_refund: ctx.accounts.rent_refund.to_account_info(),
      delegation_claim_bot: ctx.accounts.delegation_claim_bot.to_account_info(),
      system_program: ctx.accounts.system_program.to_account_info(),
      payer: ctx.accounts.payer.to_account_info(),
      dao: ctx.accounts.dao.to_account_info(),
      position_claim_payer: ctx.accounts.position_claim_payer.to_account_info(),
      task_queue: ctx.accounts.task_queue.to_account_info(),
      delegated_position: ctx.accounts.delegated_position.to_account_info(),
      sub_dao: ctx.accounts.sub_dao.to_account_info(),
      hnt_mint: ctx.accounts.hnt_mint.to_account_info(),
      position: ctx.accounts.position.to_account_info(),
      position_authority: ctx.accounts.position_authority.to_account_info(),
      mint: ctx.accounts.mint.to_account_info(),
      position_token_account: ctx.accounts.position_token_account.to_account_info(),
      delegator_ata: ctx.accounts.delegator_ata.to_account_info(),
      task_return_account: ctx.accounts.task_return_account.to_account_info(),
    }
    .to_account_metas(None)
    .to_vec(),
    data: crate::instruction::QueueDelegationClaimV0.data(),
  };
  let (compiled_reschedule_tx, _) = compile_transaction(vec![reschedule_ix], seeds).unwrap();

  // Trigger the claim 15m after the epoch closes
  let after_epoch_trigger = TriggerV0::Timestamp(max(
    Clock::get()?.unix_timestamp,
    epoch_ts + FIFTEEN_MINUTES,
  ));

  // Trigger the transaction that schedules the next claim 15m before the next epoch ends
  let before_epoch_trigger = TriggerV0::Timestamp(max(
    Clock::get()?.unix_timestamp,
    epoch_ts + (EPOCH_LENGTH as i64) - FIFTEEN_MINUTES,
  ));

  // Pay for the tasks
  let task_costs = 2 * ctx.accounts.task_queue.min_crank_reward;
  transfer(
    CpiContext::new(
      ctx.accounts.system_program.to_account_info(),
      Transfer {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.task_queue.to_account_info(),
      },
    ),
    task_costs,
  )?;

  // First task is the reschedule, second is the claim
  ctx.accounts.delegation_claim_bot.next_task = ctx.remaining_accounts[0].key();

  let mut tasks = vec![TaskReturnV0 {
    trigger: before_epoch_trigger,
    transaction: TransactionSourceV0::CompiledV0(compiled_reschedule_tx.clone()),
    crank_reward: None,
    free_tasks: 2,
    description: format!("queue delegation epoch {}", curr_epoch + 1),
  }];

  if !ctx.accounts.delegated_position.is_claimed(curr_epoch)? {
    tasks.push(
      // At the end of each epoch, schedule the next epoch end and reschedule the cron
      TaskReturnV0 {
        trigger: after_epoch_trigger,
        transaction: TransactionSourceV0::CompiledV0(compiled_tx.clone()),
        crank_reward: None,
        free_tasks: 0,
        description: format!("delegation epoch {}", curr_epoch),
      },
    );
  }

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
    tasks: tasks.into_iter(),
  })?
  .used_accounts;

  Ok(RunTaskReturnV0 {
    tasks: vec![],
    accounts: return_accounts,
  })
}
