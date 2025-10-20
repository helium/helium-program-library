use anchor_lang::{
  prelude::*,
  solana_program::sysvar::instructions::{get_instruction_relative, ID as IX_ID},
};
use anchor_spl::token::{Mint, Token, TokenAccount};
use tuktuk_program::{tuktuk, TaskV0, TriggerV0};

use crate::{errors::ErrorCode, state::*};

#[derive(Accounts)]
pub struct LendV0<'info> {
  #[account(
    mut,
    has_one = next_task,
    has_one = input_account,
    has_one = input_mint,
    has_one = output_mint,
    has_one = destination_wallet,
    constraint = !dca.is_swapping,
  )]
  pub dca: Box<Account<'info, DcaV0>>,
  #[account(mut)]
  pub input_account: Box<Account<'info, TokenAccount>>,
  pub input_mint: Box<Account<'info, Mint>>,
  pub output_mint: Box<Account<'info, Mint>>,
  /// CHECK: destination wallet for output tokens
  pub destination_wallet: UncheckedAccount<'info>,
  #[account(
    mut,
    associated_token::mint = output_mint,
    associated_token::authority = destination_wallet,
  )]
  pub destination_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    // We snure that the _exact_ task is being executed.
    constraint = match next_task.trigger {
      TriggerV0::Timestamp(trigger_time) => trigger_time == dca.trigger_time,
      _ => false,
    }
  )]
  pub next_task: Account<'info, TaskV0>,
  pub token_program: Program<'info, Token>,
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
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

pub fn handler(ctx: Context<LendV0>) -> Result<()> {
  verify_running_in_tuktuk(
    ctx.accounts.instruction_sysvar.to_account_info(),
    ctx.accounts.dca.next_task,
  )?;

  let dca = &mut ctx.accounts.dca;

  // Calculate how much to swap this time
  // Total amount in account divided by remaining orders
  // On the last order, we'll just use whatever is left
  let current_input_balance = ctx.accounts.input_account.amount;
  let swap_amount = if dca.num_orders == 1 {
    // Last order - use everything remaining
    current_input_balance
  } else {
    // Divide remaining balance by remaining orders
    current_input_balance
      .checked_div(u64::from(dca.num_orders))
      .ok_or(ErrorCode::ArithmeticError)?
  };

  // Store the pre-swap balance of the destination token account and the input amount being swapped
  // Note: check_repay_v0 must be called after this to validate the swap and reset is_swapping.
  // If check_repay_v0 is not called, is_swapping will remain true and the next DCA execution will fail.
  dca.is_swapping = true;
  dca.pre_swap_destination_balance = ctx.accounts.destination_token_account.amount;
  dca.swap_input_amount = swap_amount;

  // The actual transfer of input tokens will be handled by the Jupiter swap in the remote transaction
  // This just validates that we're running in the correct context and sets up the pre-swap state

  Ok(())
}
