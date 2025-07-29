use anchor_lang::prelude::*;
use mini_fanout::MiniFanoutShareArgV0;

#[account]
#[derive(Default)]
pub struct WelcomePackV0 {
  pub id: u32,
  pub owner: Pubkey,
  pub asset: Pubkey,
  pub lazy_distributor: Pubkey,
  pub rewards_mint: Pubkey,
  pub rent_refund: Pubkey,
  pub sol_amount: u64,
  pub rewards_split: Vec<MiniFanoutShareArgV0>,
  pub rewards_schedule: String,
  pub asset_return_address: Pubkey,
  pub bump_seed: u8,
  pub unique_id: u32,
}

#[macro_export]
macro_rules! welcome_pack_seeds {
  ($welcome_pack:ident) => {
    &[
      b"welcome_pack".as_ref(),
      $welcome_pack.owner.as_ref(),
      $welcome_pack.id.to_le_bytes().as_ref(),
      &[$welcome_pack.bump_seed],
    ]
  };
}

#[account]
#[derive(Default)]
pub struct UserWelcomePacksV0 {
  pub next_id: u32,
  pub owner: Pubkey,
  pub bump_seed: u8,
  pub next_unique_id: u32,
}
