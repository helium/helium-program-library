use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use helium_sub_daos::DaoV0;

pub const IOT_OPERATIONS_FUND: &str = "iot_operations_fund";

#[derive(Accounts)]
pub struct TempRepairIotOperationsFund<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    has_one = authority
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hash(&String::from(IOT_OPERATIONS_FUND).into_bytes()).to_bytes()
    ],
    bump = key_to_asset.bump_seed
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
}

pub fn handler(ctx: Context<TempRepairIotOperationsFund>) -> Result<()> {
  ctx.accounts.key_to_asset.key_serialization = KeySerialization::UTF8;

  Ok(())
}
