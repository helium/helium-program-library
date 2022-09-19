use crate::state::*;
use crate::utils::resize_to_fit;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotIssuanceV0Args {
  pub name: String,
  pub image_url: String,
  pub metadata_url: String,
  pub onboarding_server: Pubkey,
  pub authority: Pubkey
}

#[derive(Accounts)]
pub struct InitializeHotspotIssuanceV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<HotspotIssuanceV0>(), hotspot_issuance.data.borrow_mut().leng()),
    seeds = ["hotspot_issuance".as_bytes(), args.collection.as_ref()],
    bump,
  )]
  pub hotspot_issuance: Box<Account<'info, HotspotIssuanceV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeHotspotIssuanceV0>,
  args: InitializeHotspotIssuanceV0Args,
) -> Result<()> {
  ctx.accounts.hotspot_issuance.set_inner(HotspotIssuanceV0 {
    count: 0,
    onboarding_server: args.onboarding_server,
    collection: args.collection,
    authority: args.authority,
    bump_seed: ctx.bumps["hotspot_issuance"]
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts_lazy_distributor,
  )?;

  Ok(())
}
