use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateTreasuryManagementArgsV0 {
  pub authority: Pubkey,
  pub curve: Curve,
  pub freeze_unix_time: i64,
}

#[derive(Accounts)]
#[instruction(args: UpdateTreasuryManagementArgsV0)]
pub struct UpdateTreasuryManagementV0<'info> {
  #[account(
    mut,
    has_one = authority,
  )]
  pub treasury_management: Box<Account<'info, TreasuryManagementV0>>,
  pub authority: Signer<'info>,
}

pub fn handler(
  ctx: Context<UpdateTreasuryManagementV0>,
  args: UpdateTreasuryManagementArgsV0,
) -> Result<()> {
  ctx.accounts.treasury_management.curve = args.curve;
  ctx.accounts.treasury_management.freeze_unix_time = args.freeze_unix_time;
  ctx.accounts.treasury_management.authority = args.authority;

  Ok(())
}
