use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateHotspotIssuerArgsV0 {
  pub maker: Option<Pubkey>,
  pub authority: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateHotspotIssuerArgsV0)]
pub struct UpdateHotspotIssuerV0<'info> {
  #[account(
    mut,
    has_one = authority,
  )]
  pub hotspot_issuer: Box<Account<'info, HotspotIssuerV0>>,

  pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateHotspotIssuerV0>, args: UpdateHotspotIssuerArgsV0) -> Result<()> {
  let issuer = &mut ctx.accounts.hotspot_issuer;
  if args.maker.is_some() {
    issuer.maker = args.maker.unwrap();
  }
  if args.authority.is_some() {
    issuer.authority = args.authority.unwrap();
  }
  Ok(())
}
