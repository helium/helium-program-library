use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Task already exists")]
  TaskAlreadyExists,
}
