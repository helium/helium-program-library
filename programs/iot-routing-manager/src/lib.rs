use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("irtjLnjCMmyowq2m3KWqpuFB3M9gdNA9A4t4d6VWmzB");

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "IOT Routing Manager",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/iot-routing-manager",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod iot_routing_manager {
  use super::*;

  pub fn initialize_devaddr_constraint_v0(
    ctx: Context<InitializeDevaddrConstraintV0>,
    args: InitializeDevaddrConstraintArgsV0,
  ) -> Result<()> {
    initialize_devaddr_constraint_v0::handler(ctx, args)
  }

  pub fn remove_devaddr_constraint_v0(ctx: Context<RemoveDevaddrConstraintV0>) -> Result<()> {
    remove_devaddr_constraint_v0::handler(ctx)
  }

  pub fn initialize_net_id_v0(
    ctx: Context<InitializeNetIdV0>,
    args: InitializeNetIdArgsV0,
  ) -> Result<()> {
    initialize_net_id_v0::handler(ctx, args)
  }

  pub fn initialize_organization_v0(ctx: Context<InitializeOrganizationV0>) -> Result<()> {
    initialize_organization_v0::handler(ctx)
  }

  pub fn initialize_routing_manager_v0(
    ctx: Context<InitializeRoutingManagerV0>,
    args: InitializeRoutingManagerArgsV0,
  ) -> Result<()> {
    initialize_routing_manager_v0::handler(ctx, args)
  }

  pub fn initialize_organization_delegate_v0(
    ctx: Context<InitializeOrganizationDelegateV0>,
  ) -> Result<()> {
    initialize_organization_delegate_v0::handler(ctx)
  }

  pub fn remove_organization_delegate_v0(ctx: Context<RemoveOrganizationDelegateV0>) -> Result<()> {
    remove_organization_delegate_v0::handler(ctx)
  }

  pub fn approve_organization_v0(ctx: Context<ApproveOrganizationV0>) -> Result<()> {
    approve_organization_v0::handler(ctx)
  }

  pub fn update_organization_v0(
    ctx: Context<UpdateOrganizationV0>,
    args: UpdateOrganizationArgsV0,
  ) -> Result<()> {
    update_organization_v0::handler(ctx, args)
  }

  pub fn temp_backfill_organization(
    ctx: Context<TempBackfillOrganization>,
    args: TempBackfillOrganizationArgs,
  ) -> Result<()> {
    temp_backfill_organization::handler(ctx, args)
  }

  pub fn temp_backfill_organization_delegate(
    ctx: Context<TempBackfillOrganizationDelegate>,
  ) -> Result<()> {
    temp_backfill_organization_delegate::handler(ctx)
  }
}
