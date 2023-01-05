use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotIssuerArgsV0 {
  pub maker: Pubkey,
  pub authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeHotspotIssuerArgsV0)]
pub struct InitializeHotspotIssuerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    has_one = authority
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
  pub authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + std::mem::size_of::<HotspotIssuerV0>(),
    seeds = ["hotspot_issuer".as_bytes(), hotspot_config.key().as_ref(), args.maker.as_ref()],
    bump,
  )]
  pub hotspot_issuer: Box<Account<'info, HotspotIssuerV0>>,

  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeHotspotIssuerV0>,
  args: InitializeHotspotIssuerArgsV0,
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
