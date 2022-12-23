use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use std::str::FromStr;

#[derive(Accounts)]
#[instruction(time_offset: i64)]
pub struct SetTimeOffsetV0<'info> {
  #[account(mut, has_one = realm_authority)]
  pub registrar: AccountLoader<'info, Registrar>,
  pub realm_authority: Signer<'info>,
}

/// A debug-only instruction that advances the time.
pub fn handler(ctx: Context<SetTimeOffsetV0>, time_offset: i64) -> Result<()> {
  let allowed_program = Pubkey::from_str("GovernanceProgramTest1111111111111111111111").unwrap();
  let registrar = &mut ctx.accounts.registrar.load_mut()?;
  require_keys_eq!(
    registrar.governance_program_id,
    allowed_program,
    VsrError::DebugInstruction
  );
  registrar.time_offset = time_offset;
  Ok(())
}
