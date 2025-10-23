use anchor_lang::{
  prelude::*,
  solana_program::sysvar::instructions::{get_instruction_relative, ID as IX_ID},
};
use anchor_spl::token::{transfer, Token, TokenAccount, Transfer};
use tuktuk_program::{tuktuk, TaskV0};

use crate::{dca_seeds, errors::ErrorCode, state::*};

#[derive(Accounts)]
pub struct LendV0<'info> {
  #[account(
    mut,
    has_one = next_task,
    has_one = input_account,
    has_one = destination_token_account,
    constraint = !dca.is_swapping,
  )]
  pub dca: Box<Account<'info, DcaV0>>,
  #[account(mut)]
  pub input_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub destination_token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Account to receive the lent input tokens for swapping
  #[account(mut)]
  pub lend_destination: UncheckedAccount<'info>,
  #[account(
    mut,
    // Ensure that the _exact_ task we queued at initialize is being executed.
    constraint = next_task.queued_at == dca.queued_at,
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

  // Use the fixed swap amount per order from initialization
  // On the last order, we'll use whatever is left to handle any rounding
  let current_input_balance = ctx.accounts.input_account.amount;
  let swap_amount = if dca.num_orders == 1 {
    // Last order - use everything remaining
    current_input_balance
  } else {
    // Use the swap amount per order specified at initialization
    dca.swap_amount_per_order
  };

  // Store the pre-swap balance of the destination token account and the input amount being swapped
  // Note: check_repay_v0 must be called after this to validate the swap and reset is_swapping.
  // If check_repay_v0 is not called, is_swapping will remain true and the next DCA execution will fail.
  dca.is_swapping = true;
  dca.pre_swap_destination_balance = ctx.accounts.destination_token_account.amount;
  dca.swap_input_amount = swap_amount;

  // Transfer (lend) the input tokens to the lend destination so they can be swapped
  transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.input_account.to_account_info(),
        to: ctx.accounts.lend_destination.to_account_info(),
        authority: dca.to_account_info(),
      },
      &[dca_seeds!(dca)],
    ),
    swap_amount,
  )?;

  Ok(())
}
