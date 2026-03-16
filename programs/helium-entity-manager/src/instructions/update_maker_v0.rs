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

  if let Some(issuing_authority) = args.issuing_authority {
    maker.issuing_authority = issuing_authority;
  }
  if let Some(update_authority) = args.update_authority {
    maker.update_authority = update_authority;
  }
  Ok(())
}
