use anchor_lang::{
  prelude::*,
  solana_program::{instruction::Instruction, program::invoke, sysvar::instructions::ID as IX_ID},
};
use tuktuk_program::TaskV0;

use crate::{
  errors::ErrorCode, instructions::lend_v0::verify_running_in_tuktuk, state::*, SWAP_PROGRAM,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SwapArgsV0 {
  /// The swap instruction's data, built off-chain and opaque here. What it is allowed to do is
  /// bounded by the program it runs against, which is pinned, and by the repayment
  /// `check_repay_v0` prices against the oracles afterwards.
  pub data: Vec<u8>,
}

/// Runs a DCA's swap as a CPI from this program rather than as an instruction `run_task_v0`
/// invokes directly.
///
/// `run_task_v0` reads the return data slot after each instruction it invokes and, when the
/// program it invoked is the one that set it, requires the bytes to be a `RunTaskReturnV0`. A
/// swap program that returns a value of its own therefore fails the whole run. Invoked through
/// here the swap program is a child, whose return data `run_task_v0` ignores, and the only
/// return this run makes is `check_repay_v0`'s.
#[derive(Accounts)]
#[instruction(args: SwapArgsV0)]
pub struct SwapV0<'info> {
  #[account(has_one = next_task)]
  pub dca: AccountLoader<'info, DcaV0>,
  #[account(
    // Ensure that the _exact_ task we queued at initialize is being executed.
    constraint = next_task.queued_at == dca.load()?.queued_at,
  )]
  pub next_task: Account<'info, TaskV0>,
  /// CHECK: pinned by address, so instruction data this program does not interpret cannot
  /// choose its own callee.
  #[account(address = SWAP_PROGRAM)]
  pub swap_program: UncheckedAccount<'info>,
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  #[account(address = IX_ID)]
  pub instruction_sysvar: AccountInfo<'info>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, SwapV0<'info>>,
  args: SwapArgsV0,
) -> Result<()> {
  // The binding comes before the state check so that a call from outside the DCA's own task is
  // refused as InvalidCpiContext rather than LendNotCalled, matching check_repay_v0.
  verify_running_in_tuktuk(
    ctx.accounts.instruction_sysvar.to_account_info(),
    ctx.accounts.dca.load()?.next_task,
  )?;
  // The swap runs only between `lend_v0` and `check_repay_v0`: the window where the input is out
  // on loan and the output is still to be priced.
  require_eq!(
    ctx.accounts.dca.load()?.is_swapping,
    1,
    ErrorCode::LendNotCalled
  );

  // The privileges are the ones this instruction was invoked with, so a signer here is a signer
  // `run_task_v0` already granted from the task's own seeds. Nothing is escalated by passing
  // them on.
  let accounts = ctx
    .remaining_accounts
    .iter()
    .map(|account| AccountMeta {
      pubkey: *account.key,
      is_signer: account.is_signer,
      is_writable: account.is_writable,
    })
    .collect::<Vec<_>>();

  invoke(
    &Instruction {
      program_id: SWAP_PROGRAM,
      accounts,
      data: args.data,
    },
    ctx.remaining_accounts,
  )?;

  Ok(())
}
