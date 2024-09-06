use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use bubblegum_cpi::cpi::{accounts::CreateTree, create_tree};
use bubblegum_cpi::program::Bubblegum;

use crate::{shared_merkle_seeds, state::SharedMerkleV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeSharedMerkleArgsV0 {
  pub proof_size: u8,
}

#[derive(Accounts)]
#[instruction(args: InitializeSharedMerkleArgsV0)]
pub struct InitializeSharedMerkleV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    seeds = [b"shared_merkle", &args.proof_size.to_le_bytes()[..]],
    bump,
    payer = payer,
    space = 8 + SharedMerkleV0::INIT_SPACE + 32,
  )]
  pub shared_merkle: Account<'info, SharedMerkleV0>,
  #[account(
    mut,
    seeds = [merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  /// CHECK: Checked by cpi
  pub tree_authority: AccountInfo<'info>,
  /// CHECK: Checked by cpi
  #[account(mut)]
  pub merkle_tree: UncheckedAccount<'info>,

  pub system_program: Program<'info, System>,
  pub log_wrapper: Program<'info, Noop>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub const STARTING_DEPTH: u32 = 17;
pub const BUFFER_SIZE: u32 = 64;

fn div_ceil(dividend: u64, divisor: u64) -> u64 {
  (dividend + divisor - 1) / divisor
}

pub fn handler(
  ctx: Context<InitializeSharedMerkleV0>,
  args: InitializeSharedMerkleArgsV0,
) -> Result<()> {
  let depth = STARTING_DEPTH + args.proof_size as u32;
  let total_lamports = ctx.accounts.merkle_tree.lamports() + ctx.accounts.tree_authority.lamports();
  ctx.accounts.shared_merkle.set_inner(SharedMerkleV0 {
    proof_size: args.proof_size,
    price_per_mint: div_ceil(total_lamports, 2u64.pow(depth) - 3), // because we can swap with 3 left
    merkle_tree: ctx.accounts.merkle_tree.key(),
    bump_seed: ctx.bumps["shared_merkle"],
  });
  let signer_seeds = shared_merkle_seeds!(ctx.accounts.shared_merkle);
  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        tree_creator: ctx.accounts.shared_merkle.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
      &[signer_seeds],
    ),
    depth,
    BUFFER_SIZE,
    None,
  )?;
  Ok(())
}
