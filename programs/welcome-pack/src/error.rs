use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Invalid asset return address")]
  InvalidAssetReturnAddress,
  #[msg("Invalid asset")]
  InvalidAsset,
  #[msg("Invalid rewards recipient")]
  InvalidRewardsRecipient,
  #[msg("Claim approval expired")]
  ClaimApprovalExpired,
  #[msg("Invalid claim approval signature")]
  InvalidClaimApprovalSignature,
}
