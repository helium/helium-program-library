use anchor_lang::{
  prelude::*,
  solana_program::sysvar::instructions::{get_instruction_relative, ID as IX_ID},
};
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
}

#[derive(Accounts)]
#[instruction(args: InitializeDcaArgsV0)]
pub struct InitializeDcaV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<DcaV0>() + 64 + args.dca_url.len(),
    seeds = [b"dca", authority.key().as_ref(), input_mint.key().as_ref(), output_mint.key().as_ref(), args.index.to_le_bytes().as_ref()],
    bump
  )]
  pub dca: Box<Account<'info, DcaV0>>,
  pub input_mint: Box<Account<'info, Mint>>,
  pub output_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = output_mint,
    associated_token::authority = destination_wallet,
  )]
  pub destination_token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Checked by loading with pyth
  pub input_price_oracle: UncheckedAccount<'info>,
  /// CHECK: Checked by loading with pyth
  pub output_price_oracle: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = input_mint,
    associated_token::authority = dca,
  )]
  pub input_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::mint = input_mint,
    associated_token::authority = payer,
  )]
  pub payer_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: destination wallet for output tokens
  pub destination_wallet: UncheckedAccount<'info>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump
  )]
  pub queue_authority: UncheckedAccount<'info>,
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: task account to be created (optional, only if not in tuktuk)
  #[account(mut)]
  pub task: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  #[account(address = IX_ID)]
  pub instruction_sysvar: AccountInfo<'info>,
}

fn is_running_in_tuktuk(instruction_sysvar: &AccountInfo) -> bool {
  if let Ok(current_ix) = get_instruction_relative(0, instruction_sysvar) {
    // Check that the current instruction is being called by tuktuk program
    if current_ix.program_id == tuktuk::ID {
      // Check that the instruction being called is run_task_v0 by verifying the discriminator
      const RUN_TASK_V0_DISCRIMINATOR: [u8; 8] = [0x34, 0xb8, 0x27, 0x81, 0x7e, 0xf5, 0xb0, 0xed];
      if current_ix.data.len() >= 8 && current_ix.data[0..8] == RUN_TASK_V0_DISCRIMINATOR {
        return true;
      }
    }
  }
  false
}

pub fn handler(
  ctx: Context<InitializeDcaV0>,
  args: InitializeDcaArgsV0,
) -> Result<RunTaskReturnV0> {
  let dca = &mut ctx.accounts.dca;
  let now = Clock::get()?.unix_timestamp;

  // Transfer the total amount needed for all orders from authority to DCA input account
  let total_amount = args
    .swap_amount_per_order
    .checked_mul(u64::from(args.num_orders))
    .ok_or(ErrorCode::ArithmeticError)?;

  anchor_spl::token::transfer(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      anchor_spl::token::Transfer {
        from: ctx.accounts.payer_account.to_account_info(),
        to: ctx.accounts.input_account.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
      },
    ),
    total_amount,
  )?;

  dca.set_inner(DcaV0 {
    index: args.index,
    queued_at: now,
    destination_token_account: ctx.accounts.destination_token_account.key(),
    authority: ctx.accounts.authority.key(),
    input_price_oracle: ctx.accounts.input_price_oracle.key(),
    output_price_oracle: ctx.accounts.output_price_oracle.key(),
    input_mint: ctx.accounts.input_mint.key(),
    output_mint: ctx.accounts.output_mint.key(),
    input_account: ctx.accounts.input_account.key(),
    destination_wallet: ctx.accounts.destination_wallet.key(),
    pre_swap_destination_balance: 0,
    swap_input_amount: 0,
    initial_num_orders: args.num_orders,
    num_orders: args.num_orders,
    swap_amount_per_order: args.swap_amount_per_order,
    interval_seconds: args.interval_seconds,
    next_task: ctx.accounts.task.key(),
    slippage_bps_from_oracle: args.slippage_bps_from_oracle,
    task_queue: ctx.accounts.task_queue.key(),
    queue_authority_bump: ctx.bumps.queue_authority,
    bump: ctx.bumps.dca,
    is_swapping: false,
    dca_signer: args.dca_signer,
    dca_url: args.dca_url.clone(),
    rent_refund: ctx.accounts.payer.key(),
  });

  let running_in_tuktuk = is_running_in_tuktuk(&ctx.accounts.instruction_sysvar);

  let task = TaskReturnV0 {
    trigger: TriggerV0::Timestamp(now),
    transaction: TransactionSourceV0::RemoteV0 {
      signer: args.dca_signer,
      url: format!("{}/{}", args.dca_url, dca.key()),
    },
    crank_reward: None,
    free_tasks: 3,
    description: format!("dca {}", &dca.key().to_string()[..(32 - 4)]),
  };

  if running_in_tuktuk {
    // Just return the task if we're running inside tuktuk
    Ok(RunTaskReturnV0 {
      tasks: vec![task],
      accounts: vec![],
    })
  } else {
    // CPI to tuktuk to schedule the task
    queue_task_v0(
      CpiContext::new_with_signer(
        ctx.accounts.tuktuk_program.to_account_info(),
        QueueTaskV0 {
          payer: ctx.accounts.payer.to_account_info(),
          queue_authority: ctx.accounts.queue_authority.to_account_info(),
          task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
          task_queue: ctx.accounts.task_queue.to_account_info(),
          task: ctx.accounts.task.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
        &[queue_authority_seeds!(dca)],
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

    // Return empty task since we already scheduled it
    Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    })
  }
}
