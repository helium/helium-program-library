use anchor_lang::prelude::*;

declare_id!("1atNarMiQ8RMLkcTwqHHUESs2f4SB3uouPKFLbXcMwE");

pub mod error;
pub mod instructions;
pub mod merkle_proof;
pub mod state;

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
}
