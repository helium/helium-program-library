use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;

pub const TESTING: bool = std::option_env!("TESTING").is_some();

#[derive(Accounts)]
#[instruction(time_offset: i64)]
pub struct SetTimeOffsetV0<'info> {
  #[account(mut, has_one = realm_authority)]
  pub registrar: AccountLoader<'info, Registrar>,
  pub realm_authority: Signer<'info>,
}

/// A debug-only instruction that advances the time.
pub fn handler(ctx: Context<SetTimeOffsetV0>, time_offset: i64) -> Result<()> {
  let registrar = &mut ctx.accounts.registrar.load_mut()?;
  require!(TESTING, VsrError::DebugInstruction);
  registrar.time_offset = time_offset;
  Ok(())
}
