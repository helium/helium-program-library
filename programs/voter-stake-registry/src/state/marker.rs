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
  /// Whether this vote has been cleared on the position after proposal expired
  /// DEPRECATED. New votes will have markers closed after the vote completes.
  pub _deprecated_relinquished: bool,
  // Keep track of which delegation index voted on this marker,
  // earlier delegators can override
  pub proxy_index: u16,
  // Ensure the refund goes to whoever paid to create the marker when closing
  pub rent_refund: Pubkey,
}

/// Marker to indicate that a proxy intends to vote this way on a proposal,
/// all votes of proxies are permissionless based on this marker
#[account]
#[derive(Default)]
pub struct ProxyMarkerV0 {
  pub voter: Pubkey,
  pub proposal: Pubkey,
  pub choices: Vec<u16>,
  pub bump_seed: u8,
  // Ensure the refund goes to whoever paid to create the marker when closing
  pub rent_refund: Pubkey,
}
