use anchor_lang::prelude::*;

#[error_code]
pub enum VsrError {
  // 6000 / 0x1770
  #[msg("Exchange rate must be greater than zero")]
  InvalidRate,
  // 6001 / 0x1771
  #[msg("")]
  RatesFull,
  // 6002 / 0x1772
  #[msg("")]
  VotingMintNotFound,
  // 6003 / 0x1773
  #[msg("")]
  DepositEntryNotFound,
  // 6004 / 0x1774
  #[msg("")]
  DepositEntryFull,
  // 6005 / 0x1775
  #[msg("")]
  VotingTokenNonZero,
  // 6006 / 0x1776
  #[msg("")]
  OutOfBoundsDepositEntryIndex,
  // 6007 / 0x1777
  #[msg("")]
  UnusedDepositEntryIndex,
  // 6008 / 0x1778
  #[msg("")]
  InsufficientUnlockedTokens,
  // 6009 / 0x1779
  #[msg("")]
  UnableToConvert,
  // 6010 / 0x177a
  #[msg("")]
  InvalidLockupPeriod,
  // 6011 / 0x177b
  #[msg("")]
  InvalidEndTs,
  // 6012 / 0x177c
  #[msg("")]
  InvalidDays,
  // 6013 / 0x177d
  #[msg("")]
  VotingMintConfigIndexAlreadyInUse,
  // 6014 / 0x177e
  #[msg("")]
  OutOfBoundsVotingMintConfigIndex,
  // 6015 / 0x177f
  #[msg("Exchange rate decimals cannot be larger than registrar decimals")]
  InvalidDecimals,
  // 6016 / 0x1780
  #[msg("")]
  InvalidToDepositAndWithdrawInOneSlot,
  // 6017 / 0x1781
  #[msg("")]
  ShouldBeTheFirstIxInATx,
  // 6018 / 0x1782
  #[msg("")]
  ForbiddenCpi,
  // 6019 / 0x1783
  #[msg("")]
  InvalidMint,
  // 6020 / 0x1784
  #[msg("")]
  DebugInstruction,
  // 6021 / 0x1785
  #[msg("")]
  ClawbackNotAllowedOnDeposit,
  // 6022 / 0x1786
  #[msg("")]
  DepositStillLocked,
  // 6023 / 0x1787
  #[msg("")]
  InvalidAuthority,
  // 6024 / 0x1788
  #[msg("")]
  InvalidTokenOwnerRecord,
  // 6025 / 0x1789
  #[msg("")]
  InvalidRealmAuthority,
  // 6026 / 0x178a
  #[msg("")]
  VoterWeightOverflow,
  // 6027 / 0x178b
  #[msg("")]
  LockupSaturationMustBePositive,
  // 6028 / 0x178c
  #[msg("")]
  VotingMintConfiguredWithDifferentIndex,
  // 6029 / 0x178d
  #[msg("")]
  InternalProgramError,
  // 6030 / 0x178e
  #[msg("")]
  InsufficientLockedTokens,
  // 6031 / 0x178f
  #[msg("")]
  MustKeepTokensLocked,
  // 6032 / 0x1790
  #[msg("")]
  InvalidLockupKind,
  // 6033 / 0x1791
  #[msg("")]
  InvalidChangeToClawbackDepositEntry,
  // 6034 / 0x1792
  #[msg("")]
  InternalErrorBadLockupVoteWeight,
  // 6035 / 0x1793
  #[msg("")]
  DepositStartTooFarInFuture,
  // 6036 / 0x1794
  #[msg("")]
  VaultTokenNonZero,
  // 6037 / 0x1795
  #[msg("")]
  InvalidTimestampArguments,

  #[msg("Cast vote is not allowed on update_voter_weight_record_v0 endpoint")]
  CastVoteIsNotAllowed,

  #[msg("Program id was not what was expected")]
  InvalidProgramId,

  #[msg("")]
  InvalidMintOwner,
  #[msg("")]
  InvalidMintAmount,
  #[msg("")]
  DuplicatedNftDetected,
  #[msg("")]
  InvalidTokenOwnerForVoterWeightRecord,
  #[msg("")]
  NftAlreadyVoted,
  #[msg("")]
  InvalidProposalForNftVoteRecord,
  #[msg("")]
  InvalidTokenOwnerForNftVoteRecord,
  #[msg("")]
  UninitializedAccount,
  #[msg("")]
  PositionNotWritable,
  #[msg("")]
  InvalidVoteRecordForNftVoteRecord,
  #[msg("")]
  VoteRecordMustBeWithdrawn,
  #[msg("")]
  VoterWeightRecordMustBeExpired,
  #[msg("")]
  InvalidMintForPosition,
  #[msg("")]
  InvalidOwner,
  #[msg("You may not deposit additional tokens on a position created during the genesis period that still has the genesis multiplier")]
  NoDepositOnGenesisPositions,
  #[msg("Cannot change a position while active votes exist")]
  ActiveVotesExist,
  #[msg("Position update authority must sign off on this transaction")]
  UnauthorizedPositionUpdateAuthority,
}
