use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use std::mem::size_of;

#[derive(Accounts)]
pub struct UpdateMaxVoterWeightV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    has_one = realm_governing_token_mint
  )]
  pub registrar: Box<Account<'info, Registrar>>,
  pub realm_governing_token_mint: Account<'info, Mint>,

  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + size_of::<MaxVoterWeightRecord>(),
    seeds = [b"max-voter-weight-record".as_ref(), registrar.realm.as_ref(), registrar.realm_governing_token_mint.as_ref()],
    bump,
  )]
  pub max_voter_weight_record: Account<'info, MaxVoterWeightRecord>,
  pub system_program: Program<'info, System>,
}

/// Creates MaxVoterWeightRecord used by spl-gov
/// This instruction should only be executed once per realm/governing_token_mint to create the account
pub fn handler(ctx: Context<UpdateMaxVoterWeightV0>) -> Result<()> {
  let registrar = &ctx.accounts.registrar;
  let max_voter_weight_record = &mut ctx.accounts.max_voter_weight_record;

  max_voter_weight_record.realm = registrar.realm;
  max_voter_weight_record.governing_token_mint = registrar.realm_governing_token_mint;
  max_voter_weight_record.max_voter_weight_expiry = None;

  let config_idx =
    registrar.voting_mint_config_index(ctx.accounts.realm_governing_token_mint.key())?;

  let governing_mint_supply = ctx.accounts.realm_governing_token_mint.supply;

  let max_locked_vote_weight =
    registrar.voting_mints[config_idx].max_extra_lockup_vote_weight(governing_mint_supply)?;
  let genesis_multiplier = registrar.voting_mints[config_idx].genesis_vote_power_multiplier;

  max_voter_weight_record.max_voter_weight = max_locked_vote_weight
    .checked_mul(genesis_multiplier as u64)
    .unwrap();

  Ok(())
}
