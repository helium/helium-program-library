use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::state::{MaxVoterWeightRecord, Registrar};

/// Creates MaxVoterWeightRecord used by spl-gov
/// This instruction should only be executed once per realm/governing_token_mint to create the account
#[derive(Accounts)]
pub struct UpdateMaxVoterWeightV0<'info> {
  #[account(
        init_if_needed,
        seeds = [ b"max-voter-weight-record".as_ref(),
                registrar.load()?.realm.as_ref(),
                registrar.load()?.realm_governing_token_mint.as_ref()],
        bump,
        payer = payer,
        space = MaxVoterWeightRecord::get_space()
    )]
  pub max_voter_weight_record: Account<'info, MaxVoterWeightRecord>,
  #[account(
      has_one = realm_governing_token_mint
    )]
  pub registrar: AccountLoader<'info, Registrar>,
  pub realm_governing_token_mint: Account<'info, Mint>,

  #[account(mut)]
  pub payer: Signer<'info>,

  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateMaxVoterWeightV0>) -> Result<()> {
  let max_voter_weight_record = &mut ctx.accounts.max_voter_weight_record;

  let registrar = ctx.accounts.registrar.load()?;
  max_voter_weight_record.realm = registrar.realm;
  max_voter_weight_record.governing_token_mint = registrar.realm_governing_token_mint;

  max_voter_weight_record.max_voter_weight_expiry = None;
  let config_idx =
    registrar.voting_mint_config_index(ctx.accounts.realm_governing_token_mint.key())?;
  let max_scale = registrar.voting_mints[config_idx].max_extra_lockup_vote_weight_scaled_factor;
  max_voter_weight_record.max_voter_weight = ctx
    .accounts
    .realm_governing_token_mint
    .supply
    .checked_mul(max_scale)
    .unwrap();

  Ok(())
}
