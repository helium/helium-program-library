use std::cmp::max;

use anchor_lang::{prelude::*, InstructionData};
use anchor_spl::token::{Mint, TokenAccount};
use helium_sub_daos::{DaoV0, DelegatedPositionV0, SubDaoV0};
use spl_token::solana_program::instruction::Instruction;
use tuktuk_program::{
  compile_transaction,
  tuktuk::{
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::QueueTaskArgsV0,
  TaskQueueAuthorityV0, TaskQueueV0, TransactionSourceV0, TriggerV0,
};

use super::FIFTEEN_MINUTES;
use crate::{error::ErrorCode, DelegationClaimBotV0, EPOCH_LENGTH};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StartDelegationClaimBotArgsV0 {
  pub task_id: u16,
}

#[derive(Accounts)]
pub struct StartDelegationClaimBotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Via seeds
  #[account(
    seeds = [b"queue_authority"],
    bump,
  )]
  pub queue_authority: AccountInfo<'info>,
  #[account(
    mut,
    has_one = task_queue,
    has_one = delegated_position,
    constraint = !delegation_claim_bot.queued @ ErrorCode::TaskAlreadyExists,
  )]
  pub delegation_claim_bot: Box<Account<'info, DelegationClaimBotV0>>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk_program.key(),
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: Being initialize via cpi
  #[account(mut)]
  pub task: AccountInfo<'info>,
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(has_one = dao)]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(has_one = hnt_mint)]
  pub dao: Box<Account<'info, DaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  /// CHECK: The authority of the position
  pub position_authority: Signer<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    associated_token::mint = hnt_mint,
    associated_token::authority = position_authority,
  )]
  pub delegator_ata: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub tuktuk_program: Program<'info, Tuktuk>,
}

pub fn handler(
  ctx: Context<StartDelegationClaimBotV0>,
  args: StartDelegationClaimBotArgsV0,
) -> Result<()> {
  ctx.accounts.delegation_claim_bot.queued = true;
  let (payer, payer_bump) = Pubkey::find_program_address(
    &[b"custom", ctx.accounts.task_queue.key().as_ref(), b"helium"],
    &tuktuk_program::tuktuk::ID,
  );
  let (position_claim_payer, position_claim_payer_bump) = Pubkey::find_program_address(
    &[
      b"custom",
      ctx.accounts.task_queue.key().as_ref(),
      b"position",
    ],
    &tuktuk_program::tuktuk::ID,
  );
  let (compiled_tx, _) = compile_transaction(
    vec![Instruction {
      program_id: crate::ID,
      accounts: crate::__client_accounts_queue_delegation_claim_v0::QueueDelegationClaimV0 {
        system_program: ctx.accounts.system_program.key(),
        task_return_account: Pubkey::find_program_address(&[b"task_return_account"], &crate::ID).0,
        rent_refund: ctx.accounts.delegation_claim_bot.rent_refund,
        delegation_claim_bot: ctx.accounts.delegation_claim_bot.key(),
        payer,
        position_claim_payer,
        task_queue: ctx.accounts.delegation_claim_bot.task_queue,
        delegated_position: ctx.accounts.delegation_claim_bot.delegated_position,
        sub_dao: ctx.accounts.sub_dao.key(),
        dao: ctx.accounts.dao.key(),
        hnt_mint: ctx.accounts.hnt_mint.key(),
        position: ctx.accounts.delegated_position.position,
        position_authority: ctx.accounts.position_authority.key(),
        mint: ctx.accounts.mint.key(),
        position_token_account: ctx.accounts.position_token_account.key(),
        delegator_ata: ctx.accounts.delegator_ata.key(),
      }
      .to_account_metas(None)
      .to_vec(),
      data: crate::instruction::QueueDelegationClaimV0.data(),
    }],
    vec![
      vec![b"helium".to_vec(), payer_bump.to_le_bytes().to_vec()],
      vec![
        b"position".to_vec(),
        position_claim_payer_bump.to_le_bytes().to_vec(),
      ],
    ],
  )
  .unwrap();

  let curr_epoch = ctx.accounts.delegated_position.last_claimed_epoch + 1;
  ctx.accounts.delegation_claim_bot.last_claimed_epoch =
    ctx.accounts.delegated_position.last_claimed_epoch;
  let trigger_time = ((curr_epoch + 1) * EPOCH_LENGTH) - FIFTEEN_MINUTES as u64;
  ctx.accounts.delegation_claim_bot.next_task = ctx.accounts.task.key();
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.accounts.payer.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task: ctx.accounts.task.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&["queue_authority".as_bytes(), &[ctx.bumps.queue_authority]]],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(max(Clock::get()?.unix_timestamp, trigger_time as i64)),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 2,
      id: args.task_id,
      description: format!("queue delegation epoch {}", curr_epoch),
    },
  )?;

  Ok(())
}
