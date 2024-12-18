use anchor_lang::prelude::*;

use crate::NetIdV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateNetIdArgsV0 {
  authority: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateNetIdV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority
  )]
  pub net_id: Account<'info, NetIdV0>,
}

pub fn handler(ctx: Context<UpdateNetIdV0>, args: UpdateNetIdArgsV0) -> Result<()> {
  let net_id = &mut ctx.accounts.net_id;

  if args.authority.is_some() {
    net_id.authority = args.authority.unwrap()
  }

  Ok(())
}
