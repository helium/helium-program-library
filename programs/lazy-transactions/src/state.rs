use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct LazyTransactionsV0 {
  pub root: [u8; 32],
  pub name: String,
  pub max_depth: u32,
  pub authority: Pubkey,
  pub canopy: Pubkey,
  pub bump_seed: u8,
  // Bitmap of executed transactions
  pub executed_transactions: Pubkey,
}

#[account]
#[derive(Default)]
pub struct Block {
  // Empty account that blocks tx from going through more than once
}
