use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::CircuitBreaker;
use data_credits::{
  cpi::{
    accounts::{DelegateDataCreditsV0, MintDataCreditsV0},
    delegate_data_credits_v0, mint_data_credits_v0,
  },
  program::DataCredits,
  DataCreditsV0, DelegateDataCreditsArgsV0, DelegatedDataCreditsV0, MintDataCreditsArgsV0,
};
use helium_sub_daos::{DaoV0, SubDaoV0};
use tuktuk_program::{
  RunTaskReturnV0, TaskQueueV0, TaskReturnV0, TaskV0, TransactionSourceV0, TriggerV0,
};

use crate::{
  auto_top_off_seeds, errors::ErrorCode, get_next_time, get_task_ix, state::*, TUKTUK_PYTH_SIGNER,
  TUKTUK_PYTH_URL,
};

#[derive(Accounts)]
pub struct TopOffV0<'info> {
  #[account(
    mut,
    has_one = task_queue,
    has_one = next_task,
    has_one = data_credits,
    has_one = sub_dao,
  )]
  pub auto_top_off: Box<Account<'info, AutoTopOffV0>>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    constraint = match next_task.trigger {
      TriggerV0::Now => true,
      TriggerV0::Timestamp(timestamp) => timestamp <= Clock::get()?.unix_timestamp,
    } @ ErrorCode::TaskNotDue
  )]
  pub next_task: Box<Account<'info, TaskV0>>,
  #[account(
    mut,
    has_one = sub_dao,
    has_one = data_credits,
    has_one = escrow_account,
  )]
  pub delegated_data_credits: Box<Account<'info, DelegatedDataCreditsV0>>,
  #[account(
    has_one = hnt_price_oracle
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    has_one = dc_mint,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  /// CHECK: Verified by cpi
  #[account(mut)]
  pub from_account: AccountInfo<'info>,

  /// CHECK: Verified by cpi
  #[account(mut)]
  pub from_hnt_account: AccountInfo<'info>,

  /// CHECK: Checked by loading with pyth. Also double checked by the has_one on data credits instance.
  pub hnt_price_oracle: UncheckedAccount<'info>,

  /// CHECK: Verified by cpi, has_one
  #[account(mut)]
  pub escrow_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Verified by cpi
  #[account(mut)]
  pub circuit_breaker: AccountInfo<'info>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub data_credits_program: Program<'info, DataCredits>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, TopOffV0<'info>>) -> Result<RunTaskReturnV0> {
  let auto_top_off = &mut ctx.accounts.auto_top_off;

  let dc_amount = auto_top_off
    .threshold
    .saturating_sub(ctx.accounts.escrow_account.amount);

  auto_top_off.next_task = ctx.remaining_accounts[0].key();
  auto_top_off.next_pyth_task = ctx.remaining_accounts[1].key();

  mint_data_credits_v0(
    CpiContext::new_with_signer(
      ctx.accounts.data_credits_program.to_account_info(),
      MintDataCreditsV0 {
        data_credits: ctx.accounts.data_credits.to_account_info(),
        hnt_price_oracle: ctx.accounts.hnt_price_oracle.to_account_info(),
        burner: ctx.accounts.from_hnt_account.to_account_info(),
        recipient_token_account: ctx.accounts.from_account.to_account_info(),
        recipient: auto_top_off.to_account_info(),
        owner: auto_top_off.to_account_info(),
        hnt_mint: ctx.accounts.hnt_mint.to_account_info(),
        dc_mint: ctx.accounts.dc_mint.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        circuit_breaker_program: ctx.accounts.circuit_breaker_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
      },
      &[auto_top_off_seeds!(auto_top_off)],
    ),
    MintDataCreditsArgsV0 {
      hnt_amount: None,
      dc_amount: Some(dc_amount),
    },
  )?;

  delegate_data_credits_v0(
    CpiContext::new_with_signer(
      ctx.accounts.data_credits_program.to_account_info(),
      DelegateDataCreditsV0 {
        data_credits: ctx.accounts.data_credits.to_account_info(),
        sub_dao: ctx.accounts.sub_dao.to_account_info(),
        escrow_account: ctx.accounts.escrow_account.to_account_info(),
        delegated_data_credits: ctx.accounts.delegated_data_credits.to_account_info(),
        dc_mint: ctx.accounts.dc_mint.to_account_info(),
        dao: ctx.accounts.dao.to_account_info(),
        owner: auto_top_off.to_account_info(),
        from_account: ctx.accounts.from_account.to_account_info(),
        payer: auto_top_off.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[auto_top_off_seeds!(auto_top_off)],
    ),
    DelegateDataCreditsArgsV0 {
      amount: dc_amount,
      router_key: ctx.accounts.delegated_data_credits.router_key.clone(),
    },
  )?;

  // Pay min crank reward to task_queue from auto_top_off, if available
  let auto_top_off_info = auto_top_off.to_account_info();
  let min_rent_exempt = Rent::get()?.minimum_balance(auto_top_off_info.data_len());
  if auto_top_off_info.lamports() - min_rent_exempt >= ctx.accounts.task_queue.min_crank_reward {
    auto_top_off.sub_lamports(ctx.accounts.task_queue.min_crank_reward * 2)?;
    ctx
      .accounts
      .task_queue
      .add_lamports(ctx.accounts.task_queue.min_crank_reward * 2)?;
  } else {
    auto_top_off.next_task = Pubkey::default();
    auto_top_off.next_pyth_task = Pubkey::default();
    return Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    });
  }

  // Schedule next task via tuktuk CPI if funds available, else set next_task = Pubkey::default()
  let next_time = get_next_time(auto_top_off)?;
  let compiled_tx = get_task_ix(auto_top_off)?;
  let tasks = vec![
    TaskReturnV0 {
      trigger: TriggerV0::Timestamp(next_time),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 2,
      description: format!("topoff {}", &auto_top_off.key().to_string()[..(32 - 11)]),
    },
    TaskReturnV0 {
      trigger: TriggerV0::Timestamp(next_time - 60),
      transaction: TransactionSourceV0::RemoteV0 {
        signer: TUKTUK_PYTH_SIGNER,
        url: format!(
          "{}/{}",
          TUKTUK_PYTH_URL,
          ctx.accounts.hnt_price_oracle.key()
        ),
      },
      crank_reward: None,
      free_tasks: 0,
      description: format!(
        "pre dist {}",
        &auto_top_off.key().to_string()[..(32 - 11 - 4)]
      ),
    },
  ];

  Ok(RunTaskReturnV0 {
    tasks,
    accounts: vec![],
  })
}
