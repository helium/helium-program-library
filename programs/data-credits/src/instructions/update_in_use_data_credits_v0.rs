use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateInUseDataCreditsArgsV0 {
  new_owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: UpdateInUseDataCreditsArgsV0)]
pub struct UpdateInUseDataCreditsV0<'info> {
  #[account(
    mut,
    has_one = owner,
  )]
  pub in_use_data_credits: Box<Account<'info, InUseDataCreditsV0>>,
  pub owner: Signer<'info>,
}

pub fn handler(
  ctx: Context<UpdateInUseDataCreditsV0>,
  args: UpdateInUseDataCreditsArgsV0,
) -> Result<()> {
  ctx.accounts.in_use_data_credits.owner = args.new_owner;
  Ok(())
}
