use crate::error::ErrorCode;
use crate::state::*;
use account_compression_cpi::program::SplAccountCompression;
use anchor_lang::prelude::*;
use bubblegum_cpi::get_asset_id;
use shared_utils::{verify_compressed_nft, VerifyCompressedNftArgs};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateCompressionDestinationArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: UpdateCompressionDestinationArgsV0)]
pub struct UpdateCompressionDestinationV0<'info> {
  #[account(mut)]
  pub recipient: Box<Account<'info, RecipientV0>>,
  pub owner: Signer<'info>,
  /// CHECK: User provided destination
  pub destination: UncheckedAccount<'info>,
  /// CHECK: Checked via verify_compressed_nft
  pub merkle_tree: UncheckedAccount<'info>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, UpdateCompressionDestinationV0<'info>>,
  args: UpdateCompressionDestinationArgsV0,
) -> Result<()> {
  require_eq!(
    ctx.accounts.recipient.asset,
    get_asset_id(&ctx.accounts.merkle_tree.key(), args.index.into()),
    ErrorCode::InvalidAsset
  );
  verify_compressed_nft(VerifyCompressedNftArgs {
    data_hash: args.data_hash,
    creator_hash: args.creator_hash,
    root: args.root,
    index: args.index,
    compression_program: ctx.accounts.compression_program.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    owner: ctx.accounts.owner.key(),
    delegate: ctx.accounts.owner.key(),
    proof_accounts: ctx.remaining_accounts.to_vec(),
  })?;

  ctx.accounts.recipient.destination = ctx.accounts.destination.key();

  Ok(())
}
