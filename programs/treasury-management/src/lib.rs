use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5");

pub mod circuit_breaker;
pub mod curve;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Treasury Management",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/treasury-management",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[derive(Clone)]
pub struct TreasuryManagement;

impl anchor_lang::Id for TreasuryManagement {
  fn id() -> Pubkey {
    crate::id()
  }
}

#[program]
pub mod treasury_management {
  use super::*;

  pub fn initialize_treasury_management_v0(
    ctx: Context<InitializeTreasuryManagementV0>,
    args: InitializeTreasuryManagementArgsV0,
  ) -> Result<()> {
    initialize_treasury_management_v0::handler(ctx, args)
  }

  pub fn update_treasury_management_v0(
    ctx: Context<UpdateTreasuryManagementV0>,
    args: UpdateTreasuryManagementArgsV0,
  ) -> Result<()> {
    update_treasury_management_v0::handler(ctx, args)
  }

  pub fn redeem_v0(ctx: Context<RedeemV0>, args: RedeemArgsV0) -> Result<()> {
    redeem_v0::handler(ctx, args)
  }
}
