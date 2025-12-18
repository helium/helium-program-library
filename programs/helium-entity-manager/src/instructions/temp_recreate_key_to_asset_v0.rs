use anchor_lang::prelude::*;
use helium_sub_daos::DaoV0;

use crate::{hash_entity_key, state::*};

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempRecreateKeyToAssetArgsV0 {
  pub entity_key: Vec<u8>,
  pub key_serialization: KeySerialization,
  /// The asset ID of the existing compressed NFT
  pub asset: Pubkey,
}

/// Temporary instruction to recreate a keyToAsset account for an existing compressed NFT.
/// This is needed when a keyToAsset was accidentally closed but the cNFT still exists.
///
/// Only the hardcoded authority can call this instruction.
#[derive(Accounts)]
#[instruction(args: TempRecreateKeyToAssetArgsV0)]
pub struct TempRecreateKeyToAssetV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<KeyToAssetV0>() + 1 + args.entity_key.len(),
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hash_entity_key(&args.entity_key[..])
    ],
    bump
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<TempRecreateKeyToAssetV0>,
  args: TempRecreateKeyToAssetArgsV0,
) -> Result<()> {
  ctx.accounts.key_to_asset.set_inner(KeyToAssetV0 {
    asset: args.asset,
    dao: ctx.accounts.dao.key(),
    entity_key: args.entity_key,
    bump_seed: ctx.bumps.key_to_asset,
    key_serialization: args.key_serialization,
  });

  Ok(())
}
