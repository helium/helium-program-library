use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use shared_utils::resize_to_fit;
use spl_governance::state::realm;
use std::mem::size_of;

#[derive(Accounts)]
pub struct InitializeRegistrarV0<'info> {
  /// The voting registrar. There can only be a single registrar
  /// per governance realm and governing mint.
  #[account(
        init,
        seeds = [realm.key().as_ref(), b"registrar".as_ref(), realm_governing_token_mint.key().as_ref()],
        bump,
        payer = payer,
        space = 8 + size_of::<Registrar>() + 60
    )]
  pub registrar: Box<Account<'info, Registrar>>,

  /// An spl-governance realm
  ///
  /// CHECK: realm is validated in the instruction:
  /// realm is validated in the instruction:
  /// - realm is owned by the governance_program_id
  /// - realm_governing_token_mint must be the community or council mint
  /// - realm_authority is realm.authority
  pub realm: UncheckedAccount<'info>,

  /// CHECK: May be any instance of spl-governance
  /// The program id of the spl-governance program the realm belongs to.
  pub governance_program_id: UncheckedAccount<'info>,
  /// Either the realm community mint or the council mint.
  pub realm_governing_token_mint: Account<'info, Mint>,
  pub realm_authority: Signer<'info>,

  #[account(mut)]
  pub payer: Signer<'info>,

  pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct InitializeRegistrarArgsV0 {
  pub position_update_authority: Option<Pubkey>,
}

/// Creates a new voting registrar.
///
/// `vote_weight_decimals` is the number of decimals used on the vote weight. It must be
/// larger or equal to all token mints used for voting.
///
/// To use the registrar, call ConfigVotingMint to register token mints that may be
/// used for voting.
pub fn handler(ctx: Context<InitializeRegistrarV0>, args: InitializeRegistrarArgsV0) -> Result<()> {
  let registrar = &mut ctx.accounts.registrar;
  registrar.bump = *ctx.bumps.get("registrar").unwrap();
  registrar.governance_program_id = ctx.accounts.governance_program_id.key();
  registrar.realm = ctx.accounts.realm.key();
  registrar.realm_governing_token_mint = ctx.accounts.realm_governing_token_mint.key();
  registrar.realm_authority = ctx.accounts.realm_authority.key();
  registrar.time_offset = 0;
  registrar.position_update_authority = args.position_update_authority;
  registrar.voting_mints = vec![
    VotingMintConfigV0 {
      mint: Pubkey::default(),
      digit_shift: 0,
      locked_vote_weight_scaled_factor: 0,
      minimum_required_lockup_secs: 0,
      max_extra_lockup_vote_weight_scaled_factor: 0,
      genesis_vote_power_multiplier: 0,
      genesis_vote_power_multiplier_expiration_ts: 0,
      lockup_saturation_secs: 0,
    };
    4
  ];

  // Verify that "realm_authority" is the expected authority on "realm"
  // and that the mint matches one of the realm mints too.
  let realm = realm::get_realm_data_for_governing_token_mint(
    &registrar.governance_program_id,
    &ctx.accounts.realm.to_account_info(),
    &registrar.realm_governing_token_mint,
  )?;

  require_keys_eq!(
    realm.authority.unwrap(),
    ctx.accounts.realm_authority.key(),
    VsrError::InvalidRealmAuthority
  );

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    registrar,
  )?;

  Ok(())
}
