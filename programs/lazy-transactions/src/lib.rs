use anchor_lang::prelude::*;

declare_id!("1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h");

pub mod error;
pub mod instructions;
pub mod merkle_proof;
pub mod state;
pub mod canopy;

pub use instructions::*;
pub use state::*;

#[program]
pub mod lazy_transactions {
  use super::*;

  pub fn initialize_lazy_transactions_v0(
    ctx: Context<InitializeLazyTransactionsV0>,
    args: InitializeLazyTransactionsArgsV0,
  ) -> Result<()> {
    initialize_lazy_transactions_v0::handler(ctx, args)
  }

  pub fn execute_transaction_v0(
    ctx: Context<ExecuteTransactionV0>,
    args: ExecuteTransactionArgsV0,
  ) -> Result<()> {
    execute_transaction_v0::handler(ctx, args)
  }

  pub fn close_marker_v0(ctx: Context<CloseMarkerV0>, args: CloseMarkerArgsV0) -> Result<()> {
    close_marker_v0::handler(ctx, args)
  }

  pub fn update_lazy_transactions_v0(
    ctx: Context<UpdateLazyTransactionsV0>,
    args: UpdateLazyTransactionsArgsV0,
  ) -> Result<()> {
    update_lazy_transactions_v0::handler(ctx, args)
  }

  pub fn set_canopy_v0(
    ctx: Context<SetCanopyV0>,
    args: SetCanopyArgsV0,
  ) -> Result<()> {
    set_canopy_v0::handler(ctx, args)
  }
}
