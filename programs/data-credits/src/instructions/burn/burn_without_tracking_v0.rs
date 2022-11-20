use super::common::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnWithoutTrackingArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: BurnWithoutTrackingArgsV0)]
pub struct BurnWithoutTrackingV0<'info> {
  pub burn_accounts: BurnCommonV0<'info>,
}

pub fn handler(ctx: Context<BurnWithoutTrackingV0>, args: BurnWithoutTrackingArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    "dc".as_bytes(),
    ctx
      .accounts
      .burn_accounts
      .dc_mint
      .to_account_info()
      .key
      .as_ref(),
    &[ctx.accounts.burn_accounts.data_credits.data_credits_bump],
  ]];

  // unfreeze the burner if necessary
  if ctx.accounts.burn_accounts.burner.is_frozen() {
    token::thaw_account(
      ctx
        .accounts
        .burn_accounts
        .thaw_ctx()
        .with_signer(signer_seeds),
    )?;
  }

  // burn the dc tokens
  token::burn(
    ctx
      .accounts
      .burn_accounts
      .burn_ctx()
      .with_signer(signer_seeds),
    args.amount,
  )?;

  // freeze the burner
  token::freeze_account(
    ctx
      .accounts
      .burn_accounts
      .freeze_ctx()
      .with_signer(signer_seeds),
  )?;

  Ok(())
}
