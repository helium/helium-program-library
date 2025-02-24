use anchor_lang::prelude::*;

use crate::IotRoutingManagerV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateRoutingManagerArgsV0 {
  update_authority: Option<Pubkey>,
  net_id_authority: Option<Pubkey>,
  devaddr_price_usd: Option<u64>,
  oui_price_usd: Option<u64>,
}

#[derive(Accounts)]
pub struct UpdateRoutingManagerV0<'info> {
  pub update_authority: Signer<'info>,
  #[account(
    mut,
    has_one = update_authority
  )]
  pub routing_manager: Account<'info, IotRoutingManagerV0>,
}

pub fn handler(
  ctx: Context<UpdateRoutingManagerV0>,
  args: UpdateRoutingManagerArgsV0,
) -> Result<()> {
  let routing_manager = &mut ctx.accounts.routing_manager;

  if args.update_authority.is_some() {
    routing_manager.update_authority = args.update_authority.unwrap();
  }

  if args.net_id_authority.is_some() {
    routing_manager.net_id_authority = args.net_id_authority.unwrap();
  }

  if args.devaddr_price_usd.is_some() {
    routing_manager.devaddr_fee_usd = args.devaddr_price_usd.unwrap();
  }

  if args.oui_price_usd.is_some() {
    routing_manager.oui_fee_usd = args.oui_price_usd.unwrap();
  }

  Ok(())
}
