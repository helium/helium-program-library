use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct VoteMarkerV0 {
  pub voter: Pubkey,
  pub registrar: Pubkey,
  pub proposal: Pubkey,
  pub mint: Pubkey,
  pub choices: Vec<u16>,
  pub weight: u128,
  pub bump_seed: u8,
  /// Whether this vote has been cleared on the position after proposal expireds
  pub relinquished: bool,
  // Keep track of which delegation index voted on this marker,
  // earlier delegators can override
  pub delegation_index: u16,
  // Ensure the refund goes to whoever paid to create the marker when closing
  pub rent_refund: Pubkey,
}
