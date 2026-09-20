use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The realloc increase was too large")]
  InvalidDataIncrease,

  #[msg("Error in arithmetic")]
  ArithmeticError,

  #[msg("Provided asset was invalid")]
  InvalidAsset,

  #[msg("Oracle index was out of range")]
  InvalidOracleIndex,

  #[msg("Approver signature required")]
  InvalidApproverSignature,

  #[msg("This recipient uses a custom destination. Use distribute_custom_destination_v0")]
  CustomDestination,

  #[msg("Invalid oracle")]
  InvalidOracle,

  #[msg("Invalid lazy distributor")]
  InvalidLazyDistributor,

  #[msg("Invalid current rewards")]
  InvalidCurrentRewards,

  #[msg("Invalid discriminator")]
  InvalidDiscriminator,

  #[msg("Signature verification failed")]
  SigVerificationFailed,

  #[msg("Don't use the dummy instruction")]
  DummyInstruction,

  #[msg("Approver signature is required but was not provided")]
  MissingApprover,

  #[msg("Invalid approver")]
  InvalidApprover,

  #[msg("Remote task transaction must run under a tuktuk remote task signed by this oracle")]
  InvalidRemoteTask,

  #[msg("Remote task signature does not match the running task and its accounts")]
  RemoteTaskHashMismatch,

  #[msg("Remote task signature does not authorize this reward")]
  RemoteRewardNotSigned,
}
