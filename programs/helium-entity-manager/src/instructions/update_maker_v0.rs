use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateMakerArgsV0 {
  pub maker: Option<Pubkey>,
  pub authority: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateMakerArgsV0)]
pub struct UpdateMakerV0<'info> {
  #[account(
    mut,
    has_one = authority,
  )]
  pub maker: Box<Account<'info, MakerV0>>,

  pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateMakerV0>, args: UpdateMakerArgsV0) -> Result<()> {
  let issuer = &mut ctx.accounts.maker;
  if args.maker.is_some() {
    issuer.authority = args.maker.unwrap();
  }
  if args.authority.is_some() {
    issuer.authority = args.authority.unwrap();
  }
  Ok(())
}
