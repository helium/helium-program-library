use crate::{shared_merkle_seeds, state::*, BUFFER_SIZE, STARTING_DEPTH};
use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use bubblegum_cpi::{
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
  TreeConfig,
};

#[derive(Accounts)]
pub struct SwapSharedMerkleTreeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub shared_merkle: Box<Account<'info, SharedMerkleV0>>,
  #[account(
    mut,
    seeds = [shared_merkle.merkle_tree.key().as_ref()],
    bump,
    // Allow permissionlessly swapping trees when we're within 3 of full
    constraint = tree_authority.num_minted > (tree_authority.total_mint_capacity - 3),
    seeds::program = bubblegum_program.key()
  )]
  pub tree_authority: Box<Account<'info, TreeConfig>>,
  #[account(
    mut,
    seeds = [new_merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  /// CHECK: Checked by cpi
  pub new_tree_authority: UncheckedAccount<'info>,
  #[account(mut)]
  /// CHECK: Checked by cpi
  pub new_merkle_tree: AccountInfo<'info>,

  pub log_wrapper: Program<'info, Noop>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn handler(ctx: Context<SwapSharedMerkleTreeV0>) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[shared_merkle_seeds!(ctx.accounts.shared_merkle)];
  let depth = STARTING_DEPTH + ctx.accounts.shared_merkle.proof_size as u32;

  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.new_tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.new_merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        tree_creator: ctx.accounts.shared_merkle.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
      signer_seeds,
    ),
    depth,
    BUFFER_SIZE,
    None,
  )?;
  ctx.accounts.shared_merkle.merkle_tree = ctx.accounts.new_merkle_tree.key();

  let refund_lamports =
    ctx.accounts.new_merkle_tree.lamports() + ctx.accounts.new_tree_authority.lamports();
  **ctx
    .accounts
    .shared_merkle
    .to_account_info()
    .try_borrow_mut_lamports()? -= refund_lamports;
  **ctx
    .accounts
    .payer
    .to_account_info()
    .try_borrow_mut_lamports()? += refund_lamports;

  Ok(())
}
