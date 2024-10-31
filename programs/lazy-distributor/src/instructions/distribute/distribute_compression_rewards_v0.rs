use super::common::*;
use crate::error::ErrorCode;
use account_compression_cpi::program::SplAccountCompression;
use anchor_lang::prelude::*;
use bubblegum_cpi::get_asset_id;
use shared_utils::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DistributeCompressionRewardsArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
pub struct DistributeCompressionRewardsV0<'info> {
  pub common: DistributeRewardsCommonV0<'info>,
  /// CHECK: The merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, DistributeCompressionRewardsV0<'info>>,
  args: DistributeCompressionRewardsArgsV0,
) -> Result<()> {
  require_eq!(
    ctx.accounts.common.recipient.destination,
    Pubkey::default(),
    ErrorCode::CustomDestination
  );

  verify_compressed_nft(VerifyCompressedNftArgs {
    data_hash: args.data_hash,
    creator_hash: args.creator_hash,
    root: args.root,
    index: args.index,
    compression_program: ctx.accounts.compression_program.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    owner: ctx.accounts.common.owner.key(),
    delegate: ctx.accounts.common.owner.key(),
    proof_accounts: ctx.remaining_accounts.to_vec(),
  })?;

  require_eq!(
    ctx.accounts.common.recipient.asset,
    get_asset_id(&ctx.accounts.merkle_tree.key(), args.index.into()),
    ErrorCode::InvalidAsset
  );

  distribute_impl(&mut ctx.accounts.common)
}
