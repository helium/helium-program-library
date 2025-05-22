use anchor_lang::prelude::*;

use crate::{IotRoutingManagerV0, NetIdV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeNetIdArgsV0 {
  pub net_id: u32,
}

#[derive(Accounts)]
#[instruction(args: InitializeNetIdArgsV0)]
pub struct InitializeNetIdV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub net_id_authority: Signer<'info>,
  /// CHECK: The authority of the net id
  pub authority: AccountInfo<'info>,
  #[account(
    has_one = net_id_authority
  )]
  pub routing_manager: Account<'info, IotRoutingManagerV0>,
  #[account(
    init,
    payer = payer,
    space = 8 + NetIdV0::INIT_SPACE + 60,
    seeds = ["net_id".as_bytes(), routing_manager.key().as_ref(), &args.net_id.to_le_bytes()[..]],
    bump,
  )]
  pub net_id: Account<'info, NetIdV0>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeNetIdV0>, args: InitializeNetIdArgsV0) -> Result<()> {
  ctx.accounts.net_id.set_inner(NetIdV0 {
    id: args.net_id,
    routing_manager: ctx.accounts.routing_manager.key(),
    authority: ctx.accounts.authority.key(),
    current_addr_offset: 0,
    bump_seed: ctx.bumps.net_id,
  });
  Ok(())
}
