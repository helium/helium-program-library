use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct LazyTransactionsV0 {
  pub root: [u8; 32],
  pub name: String,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct Block {
  // Empty account that blocks tx from going through more than once
}
