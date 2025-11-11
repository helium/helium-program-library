use anchor_lang::{
  prelude::*,
  solana_program::sysvar::instructions::{get_instruction_relative, ID as IX_ID},
};
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Token, TokenAccount},
};
use circuit_breaker::CircuitBreaker;
use data_credits::{
  cpi::{
    accounts::{DelegateDataCreditsV0, MintDataCreditsV0},
    delegate_data_credits_v0, mint_data_credits_v0,
  },
  program::DataCredits,
  DelegateDataCreditsArgsV0, DelegatedDataCreditsV0, MintDataCreditsArgsV0,
};
use helium_sub_daos::DaoV0;
use tuktuk_program::{tuktuk, RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0};

use crate::{auto_top_off_seeds, errors::ErrorCode, get_next_time, get_task_ix_dc, state::*};

#[derive(Accounts)]
pub struct TopOffDcV0<'info> {
  #[account(
    mut,
    has_one = task_queue,
    has_one = data_credits,
    has_one = sub_dao,
    has_one = delegated_data_credits,
    has_one = hnt_price_oracle,
    has_one = hnt_account,
    has_one = dao,
  )]
  pub auto_top_off: AccountLoader<'info, AutoTopOffV0>,
  /// CHECK: This account takes a ton of memory. Instead of loading it into memory, just pull the min_crank_reward directly.
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  #[account(
    mut,
    has_one = escrow_account,
  )]
  pub delegated_data_credits: Box<Account<'info, DelegatedDataCreditsV0>>,
  /// CHECK: Via cpi. Not parsing here because this call runs out of memory.
  pub data_credits: UncheckedAccount<'info>,
  /// CHECK: By has_one and cpi. Not parsing here because this call runs out of memory.
  #[account(mut)]
  pub dc_mint: UncheckedAccount<'info>,
  /// CHECK: By has_one and cpi. Not parsing here because this call runs out of memory.
  #[account(mut)]
  pub hnt_mint: UncheckedAccount<'info>,
  #[account(
    has_one = dc_mint,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  /// CHECK: has_one dao is verified by the CPI call. this runs out of memory so we need to save mem.
  pub sub_dao: UncheckedAccount<'info>,

  /// CHECK: Verified by cpi
  #[account(mut)]
  pub from_account: AccountInfo<'info>,

  /// CHECK: Verified by cpi
  #[account(mut)]
  pub from_hnt_account: AccountInfo<'info>,

  #[account(mut)]
  pub hnt_account: Box<Account<'info, TokenAccount>>,

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
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  /// The Instruction Sysvar has not been implemented
  /// in the Anchor framework yet, so this is the safe approach.
  #[account(address = IX_ID)]
  pub instruction_sysvar: AccountInfo<'info>,
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
  ctx: Context<'_, '_, '_, 'info, TopOffDcV0<'info>>,
) -> Result<RunTaskReturnV0> {
  let auto_top_off_acc = ctx.accounts.auto_top_off.to_account_info();
  let auto_top_off_key = auto_top_off_acc.key();
  let mut auto_top_off = ctx.accounts.auto_top_off.load_mut()?;
  verify_running_in_tuktuk(
    ctx.accounts.instruction_sysvar.to_account_info(),
    auto_top_off.next_task,
  )?;

  let dc_amount = auto_top_off
    .threshold
    .saturating_sub(ctx.accounts.escrow_account.amount);

  auto_top_off.next_task = ctx.remaining_accounts[0].key();

  // Extract the fields needed for seeds before dropping auto_top_off
  let delegated_data_credits = auto_top_off.delegated_data_credits;
  let authority = auto_top_off.authority;
  let bump = auto_top_off.bump;

  // Use the macro with individual fields
  let seeds: &[&[&[u8]]] = &[auto_top_off_seeds!(delegated_data_credits, authority, bump)];
  drop(auto_top_off);
  if dc_amount > 0 {
    let cpi_ctx = CpiContext::new_with_signer(
      ctx.accounts.data_credits_program.to_account_info(),
      MintDataCreditsV0 {
        data_credits: ctx.accounts.data_credits.to_account_info(),
        hnt_price_oracle: ctx.accounts.hnt_price_oracle.to_account_info(),
        burner: ctx.accounts.from_hnt_account.to_account_info(),
        recipient_token_account: ctx.accounts.from_account.to_account_info(),
        recipient: auto_top_off_acc.clone(),
        owner: auto_top_off_acc.clone(),
        hnt_mint: ctx.accounts.hnt_mint.to_account_info(),
        dc_mint: ctx.accounts.dc_mint.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        circuit_breaker_program: ctx.accounts.circuit_breaker_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
      },
      seeds,
    );
    mint_data_credits_v0(
      cpi_ctx,
      MintDataCreditsArgsV0 {
        hnt_amount: None,
        dc_amount: Some(dc_amount),
      },
    )?;
    let cpi_ctx = CpiContext::new_with_signer(
      ctx.accounts.data_credits_program.to_account_info(),
      DelegateDataCreditsV0 {
        data_credits: ctx.accounts.data_credits.to_account_info(),
        sub_dao: ctx.accounts.sub_dao.to_account_info(),
        escrow_account: ctx.accounts.escrow_account.to_account_info(),
        delegated_data_credits: ctx.accounts.delegated_data_credits.to_account_info(),
        dc_mint: ctx.accounts.dc_mint.to_account_info(),
        dao: ctx.accounts.dao.to_account_info(),
        owner: auto_top_off_acc.clone(),
        from_account: ctx.accounts.from_account.to_account_info(),
        payer: auto_top_off_acc.clone(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      seeds,
    );
    delegate_data_credits_v0(
      cpi_ctx,
      DelegateDataCreditsArgsV0 {
        amount: dc_amount,
        router_key: ctx.accounts.delegated_data_credits.router_key.clone(),
      },
    )?;
  }
  // Calculate the number of free tasks we're using for this call
  // - 1 free task for the DC topoff task
  let num_tasks_used = 1u64;

  // Pay min crank reward to task_queue from auto_top_off, if available
  // descriminator + tuktuk_config + id + update_authority + reserved
  let crank_reward_offset = 8 + 32 + 4 + 32 + 32;
  let min_crank_reward = u64::from_le_bytes(
    ctx.accounts.task_queue.data.borrow()[crank_reward_offset..(crank_reward_offset + 8)]
      .try_into()
      .unwrap(),
  );
  let total_crank_reward = min_crank_reward
    .checked_mul(num_tasks_used)
    .ok_or(ErrorCode::ArithmeticError)?;

  let min_rent_exempt = Rent::get()?.minimum_balance(auto_top_off_acc.data_len());
  if auto_top_off_acc.lamports() - min_rent_exempt >= total_crank_reward {
    auto_top_off_acc.sub_lamports(total_crank_reward)?;
    ctx.accounts.task_queue.add_lamports(total_crank_reward)?;
  } else {
    let mut auto_top_off = ctx.accounts.auto_top_off.load_mut()?;
    auto_top_off.next_task = auto_top_off_key;
    drop(auto_top_off);
    return Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    });
  }

  // Schedule next DC topoff task
  // Free tasks: 1 for DC topoff
  const MAX_FREE_TASKS: u8 = 1;

  let auto_top_off = ctx.accounts.auto_top_off.load()?;
  let next_time = get_next_time(&auto_top_off)?;
  let compiled_tx = get_task_ix_dc(auto_top_off_key, &auto_top_off)?;
  let tasks = vec![TaskReturnV0 {
    trigger: TriggerV0::Timestamp(next_time),
    transaction: TransactionSourceV0::CompiledV0(compiled_tx),
    crank_reward: None,
    free_tasks: MAX_FREE_TASKS,
    description: format!("topoff dc {}", &auto_top_off_key.to_string()[..(32 - 14)]),
  }];

  Ok(RunTaskReturnV0 {
    tasks,
    accounts: vec![],
  })
}
