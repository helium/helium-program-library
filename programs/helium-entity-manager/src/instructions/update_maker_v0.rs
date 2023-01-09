use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateMakerArgsV0 {
  pub issuing_authority: Option<Pubkey>,
  pub update_authority: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateMakerArgsV0)]
pub struct UpdateMakerV0<'info> {
  #[account(
    mut,
    has_one = update_authority,
  )]
  pub maker: Box<Account<'info, MakerV0>>,

  pub update_authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateMakerV0>, args: UpdateMakerArgsV0) -> Result<()> {
  let maker = &mut ctx.accounts.maker;

  if args.issuing_authority.is_some() {
    maker.issuing_authority = args.issuing_authority.unwrap();
  }
  if args.update_authority.is_some() {
    maker.update_authority = args.update_authority.unwrap();
  }
  Ok(())
}
