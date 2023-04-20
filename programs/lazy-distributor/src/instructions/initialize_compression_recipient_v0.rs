use crate::state::*;
use anchor_lang::prelude::*;
use mpl_bubblegum::{utils::get_asset_id};
use shared_utils::*;
use spl_account_compression::program::SplAccountCompression;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeCompressionRecipientArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(
  args: InitializeCompressionRecipientArgsV0
)]
pub struct InitializeCompressionRecipientV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = ["lazy_distributor".as_bytes(), lazy_distributor.rewards_mint.as_ref()],
    bump = lazy_distributor.bump_seed,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<RecipientV0>(),
    seeds = [
      "recipient".as_bytes(), 
      lazy_distributor.key().as_ref(),
      get_asset_id(&merkle_tree.key(), args.index.into()).as_ref()
    ],
    bump,
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  /// CHECK: Used in verify_leaf cpi
  pub merkle_tree: UncheckedAccount<'info>,
  /// CHECK: Owner of the NFT
  pub owner: UncheckedAccount<'info>,
  /// CHECK: delegate of the NFT
  pub delegate: UncheckedAccount<'info>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, InitializeCompressionRecipientV0<'info>>,
  args: InitializeCompressionRecipientArgsV0,
) -> Result<()> {
  verify_compressed_nft(VerifyCompressedNftArgs {
    data_hash: args.data_hash,
    creator_hash: args.creator_hash,
    root: args.root,
    index: args.index,
    compression_program: ctx.accounts.compression_program.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    owner: ctx.accounts.owner.key(),
    delegate: ctx.accounts.delegate.key(),
    proof_accounts: ctx.remaining_accounts.to_vec(),
  })?;

  let asset_id = get_asset_id(&ctx.accounts.merkle_tree.key(), args.index as u64);
  ctx.accounts.recipient.set_inner(RecipientV0 {
    asset: asset_id,
    total_rewards: 0,
    current_config_version: 0,
    current_rewards: vec![None; ctx.accounts.lazy_distributor.oracles.len()],
    lazy_distributor: ctx.accounts.lazy_distributor.key(),
    bump_seed: ctx.bumps["recipient"],
  });

  Ok(())
}
