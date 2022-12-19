use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateHotspotConfigArgsV0 {
  pub new_authority: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateHotspotConfigArgsV0)]
pub struct UpdateHotspotConfigV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority,
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
}

pub fn handler(ctx: Context<UpdateHotspotConfigV0>, args: UpdateHotspotConfigArgsV0) -> Result<()> {
  let config = &mut ctx.accounts.hotspot_config;
  if args.new_authority.is_some() {
    config.authority = args.new_authority.unwrap();
  }

  Ok(())
}
