use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h");

pub mod canopy;
pub mod error;
pub mod instructions;
pub mod merkle_proof;
pub mod state;
pub mod util;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Lazy Transactions",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/lazy-transactions",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

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

  pub fn close_canopy_v0(ctx: Context<CloseCanopyV0>) -> Result<()> {
    close_canopy_v0::handler(ctx)
  }

  pub fn update_lazy_transactions_v0(
    ctx: Context<UpdateLazyTransactionsV0>,
    args: UpdateLazyTransactionsArgsV0,
  ) -> Result<()> {
    update_lazy_transactions_v0::handler(ctx, args)
  }

  pub fn set_canopy_v0(ctx: Context<SetCanopyV0>, args: SetCanopyArgsV0) -> Result<()> {
    set_canopy_v0::handler(ctx, args)
  }
}
