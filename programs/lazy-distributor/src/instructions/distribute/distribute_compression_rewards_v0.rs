use super::common::*;
use crate::token_metadata::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use mpl_bubblegum::{program::Bubblegum, state::TreeConfig};
use spl_account_compression::program::SplAccountCompression;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DistributeCompressionRewardsArgsV0 {
  pub hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
pub struct DistributeCompressionRewardsV0<'info> {
  pub common: DistributeRewardsCommonV0<'info>,
  /// CHECK: THe merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  #[account(
        seeds = [merkle_tree.key().as_ref()],
        bump,
        seeds::program = bubblegum_program.key()
    )]
  pub tree_authority: Account<'info, TreeConfig>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub token_program: Program<'info, Token>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, DistributeCompressionRewardsV0<'info>>,
  args: DistributeCompressionRewardsArgsV0,
) -> Result<()> {
  verify_compressed_nft(VerifyCompressedNftArgs {
    hash: args.hash,
    root: args.root,
    index: args.index,
    compression_program: ctx.accounts.compression_program.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    owner: ctx.accounts.common.owner.key(),
    delegate: ctx.accounts.common.owner.key(),
    proof_accounts: ctx.remaining_accounts.to_vec(),
  })?;

  distribute_impl(&mut ctx.accounts.common)
}
