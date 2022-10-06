use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotIssuerV0Args {
  pub maker: Pubkey,
  pub authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeHotspotIssuerV0Args)]
pub struct InitializeHotspotIssuerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds=["hotspot_config".as_bytes(), hotspot_config.collection.key().as_ref()],
    bump=hotspot_config.bump_seed
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
  #[account(
    init,
    payer = payer,
    space = 60 + std::mem::size_of::<HotspotIssuerV0>(),
    seeds = ["hotspot_issuer".as_bytes(), hotspot_config.key().as_ref(), args.maker.as_ref()],
    bump,
  )]
  pub hotspot_issuer: Box<Account<'info, HotspotIssuerV0>>,

  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeHotspotIssuerV0>,
  args: InitializeHotspotIssuerV0Args,
) -> Result<()> {
  ctx.accounts.hotspot_issuer.set_inner(HotspotIssuerV0 {
    count: 0,
    maker: args.maker,
    hotspot_config: ctx.accounts.hotspot_config.key(),
    authority: args.authority,
    bump_seed: ctx.bumps["hotspot_issuer"],
  });

  Ok(())
}
