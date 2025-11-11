use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::{QueueTaskArgsV0, TransactionSourceV0, TriggerV0},
  RunTaskReturnV0, TaskQueueAuthorityV0, TaskReturnV0,
};

use crate::{errors::ErrorCode, queue_authority_seeds, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeDcaArgsV0 {
  pub index: u16,
  pub num_orders: u32,
  pub swap_amount_per_order: u64,
  pub interval_seconds: u64,
  pub slippage_bps_from_oracle: u16,
  pub task_id: u16,
  pub dca_signer: Pubkey,
  pub dca_url: String,
  pub crank_reward: u64,
}

// Shared accounts for both nested and non-nested versions
#[derive(Accounts)]
#[instruction(args: InitializeDcaArgsV0)]
pub struct InitializeDcaCore<'info> {
  #[account(mut)]
  pub rent_payer: Signer<'info>,
  pub dca_payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    init,
    payer = rent_payer,
    space = 8 + std::mem::size_of::<DcaV0>() + 64,
    seeds = [b"dca", authority.key().as_ref(), input_mint.key().as_ref(), output_mint.key().as_ref(), args.index.to_le_bytes().as_ref()],
    bump
  )]
  pub dca: AccountLoader<'info, DcaV0>,
  pub input_mint: Account<'info, Mint>,
  pub output_mint: Account<'info, Mint>,
  #[account(
    mut,
    token::mint = output_mint,
  )]
  pub destination_token_account: Account<'info, TokenAccount>,
  /// CHECK: Checked by loading with pyth
  pub input_price_oracle: UncheckedAccount<'info>,
  /// CHECK: Checked by loading with pyth
  pub output_price_oracle: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = rent_payer,
    associated_token::mint = input_mint,
    associated_token::authority = dca,
  )]
  pub input_account: Account<'info, TokenAccount>,
  #[account(
    mut,
    associated_token::mint = input_mint,
    associated_token::authority = dca_payer,
  )]
  pub dca_payer_account: Account<'info, TokenAccount>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
}

// Full version with tuktuk accounts for standalone use
#[derive(Accounts)]
pub struct InitializeDcaV0<'info> {
  pub core: InitializeDcaCore<'info>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump
  )]
  pub queue_authority: UncheckedAccount<'info>,
  /// CHECK: task account to be created
  #[account(mut)]
  pub task: UncheckedAccount<'info>,
  #[account(
    seeds = [b"task_queue_authority", core.task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  pub tuktuk_program: Program<'info, Tuktuk>,
}

// Nested version for calling from within tuktuk (no tuktuk accounts needed)
#[derive(Accounts)]
pub struct InitializeDcaNestedV0<'info> {
  pub core: InitializeDcaCore<'info>,
  /// CHECK: task account to be created
  pub task: UncheckedAccount<'info>,
}

// Shared implementation logic
pub fn initialize_dca_impl(
  core: &mut InitializeDcaCore,
  task_key: Pubkey,
  args: &InitializeDcaArgsV0,
  dca_bump: u8,
) -> Result<TaskReturnV0> {
  let dca_key = core.dca.key();
  let mut dca = core.dca.load_init()?;
  let now = Clock::get()?.unix_timestamp;

  // Transfer the total amount needed for all orders from authority to DCA input account
  let total_amount = args
    .swap_amount_per_order
    .checked_mul(u64::from(args.num_orders))
    .ok_or(ErrorCode::ArithmeticError)?;

  anchor_spl::token::transfer(
    CpiContext::new(
      core.token_program.to_account_info(),
      anchor_spl::token::Transfer {
        from: core.dca_payer_account.to_account_info(),
        to: core.input_account.to_account_info(),
        authority: core.dca_payer.to_account_info(),
      },
    ),
    total_amount,
  )?;

  let url_bytes = args.dca_url.as_bytes();
  let mut dca_url = [0; 128];
  dca_url[..url_bytes.len()].copy_from_slice(url_bytes);
  *dca = DcaV0 {
    index: args.index,
    queued_at: now,
    destination_token_account: core.destination_token_account.key(),
    authority: core.authority.key(),
    input_price_oracle: core.input_price_oracle.key(),
    output_price_oracle: core.output_price_oracle.key(),
    input_mint: core.input_mint.key(),
    output_mint: core.output_mint.key(),
    input_account: core.input_account.key(),
    destination_wallet: core.destination_token_account.owner,
    pre_swap_destination_balance: 0,
    swap_input_amount: 0,
    initial_num_orders: args.num_orders,
    num_orders: args.num_orders,
    swap_amount_per_order: args.swap_amount_per_order,
    crank_reward: args.crank_reward,
    interval_seconds: args.interval_seconds,
    next_task: task_key,
    slippage_bps_from_oracle: args.slippage_bps_from_oracle,
    task_queue: core.task_queue.key(),
    bump: dca_bump,
    is_swapping: 0,
    dca_signer: args.dca_signer,
    dca_url,
    rent_refund: core.rent_payer.key(),
    reserved: [0; 2],
  };

  Ok(TaskReturnV0 {
    trigger: TriggerV0::Timestamp(now),
    transaction: TransactionSourceV0::RemoteV0 {
      signer: args.dca_signer,
      url: format!("{}/{}", args.dca_url, core.dca.key()),
    },
    crank_reward: Some(args.crank_reward),
    free_tasks: 1,
    description: format!("dca {}", &dca_key.to_string()[..(32 - 4)]),
  })
}

pub fn handler(ctx: Context<InitializeDcaV0>, args: InitializeDcaArgsV0) -> Result<()> {
  let task = initialize_dca_impl(
    &mut ctx.accounts.core,
    ctx.accounts.task.key(),
    &args,
    ctx.bumps.core.dca,
  )?;

  // CPI to tuktuk to schedule the task
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.accounts.core.rent_payer.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task_queue: ctx.accounts.core.task_queue.to_account_info(),
        task: ctx.accounts.task.to_account_info(),
        system_program: ctx.accounts.core.system_program.to_account_info(),
      },
      &[queue_authority_seeds!(ctx.bumps.queue_authority)],
    ),
    QueueTaskArgsV0 {
      trigger: task.trigger,
      transaction: task.transaction.clone(),
      crank_reward: task.crank_reward,
      free_tasks: task.free_tasks,
      id: args.task_id,
      description: task.description.clone(),
    },
  )?;
  Ok(())
}

pub fn handler_nested(
  ctx: Context<InitializeDcaNestedV0>,
  args: InitializeDcaArgsV0,
) -> Result<RunTaskReturnV0> {
  let task = initialize_dca_impl(
    &mut ctx.accounts.core,
    ctx.accounts.task.key(),
    &args,
    ctx.bumps.core.dca,
  )?;

  // Always return the task when nested (we're already in tuktuk)
  Ok(RunTaskReturnV0 {
    tasks: vec![task],
    accounts: vec![],
  })
}
