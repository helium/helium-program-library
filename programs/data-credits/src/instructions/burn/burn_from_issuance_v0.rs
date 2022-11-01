use super::common::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self};
use std::str::FromStr;

pub const ONBOARD_KEY: &str = "isswTaVr3jpPq4ETgnCu76WQA9XPxPGVANeKzivHefg";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnFromIssuanceArgsV0 {
  pub amount: u64,
  pub sub_dao: Pubkey,
  pub symbol: String,
  pub authority_bump: u8,
}

#[derive(Accounts)]
#[instruction(args: BurnFromIssuanceArgsV0)]
pub struct BurnFromIssuanceV0<'info> {
  #[account(
    seeds = ["hotspot_config".as_bytes(), args.sub_dao.as_ref(), args.symbol.as_bytes()],
    seeds::program = Pubkey::from_str(ONBOARD_KEY).unwrap(),
    bump = args.authority_bump,
  )]
  pub authority: Signer<'info>,
  pub burn_accounts: BurnCommonV0<'info>,
}

pub fn handler(ctx: Context<BurnFromIssuanceV0>, args: BurnFromIssuanceArgsV0) -> Result<()> {
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
