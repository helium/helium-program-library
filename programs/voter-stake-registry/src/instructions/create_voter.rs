use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as tx_instructions;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
  create_master_edition_v3, create_metadata_accounts_v3, CreateMasterEditionV3,
  CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token;
use anchor_spl::token::Mint;
use anchor_spl::token::MintTo;
use anchor_spl::token::Token;
use anchor_spl::token::TokenAccount;
use mpl_token_metadata::state::{DataV2};
use std::mem::size_of;

#[derive(Accounts)]
pub struct CreateVoter<'info> {
  pub registrar: AccountLoader<'info, Registrar>,

  #[account(
        init,
        seeds = [b"voter".as_ref(), mint.key().as_ref()],
        bump,
        payer = payer,
        space = 8 + size_of::<Voter>() + 60,
    )]
  pub voter: AccountLoader<'info, Voter>,

  #[account(
    mut,
    mint::decimals = 0,
    mint::authority = voter,
    mint::freeze_authority = voter,
  )]
  pub mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), mint.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  /// CHECK: Checked by cpi
  pub metadata: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), mint.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub master_edition: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = voter,
  )]
  pub voter_token_account: Box<Account<'info, TokenAccount>>,

  /// The authority controling the voter. Must be the same as the
  /// `governing_token_owner` in the token owner record used with
  /// spl-governance.
  pub voter_authority: Signer<'info>,

  /// The voter weight record is the account that will be shown to spl-governance
  /// to prove how much vote weight the voter has. See update_voter_weight_record.
  #[account(
        init,
        seeds = [registrar.key().as_ref(), b"voter-weight-record".as_ref(), voter_authority.key().as_ref()],
        bump,
        payer = payer,
        space = size_of::<VoterWeightRecord>(),
    )]
  pub voter_weight_record: Box<Account<'info, VoterWeightRecord>>,

  #[account(mut)]
  pub payer: Signer<'info>,

  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,

  /// CHECK: Address constraint is set
  #[account(address = tx_instructions::ID)]
  pub instructions: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_metadata_program: Program<'info, Metadata>,
}

/// Creates a new voter account. There can only be a single voter per
/// voter_authority.
///
/// The user must register with spl-governance using the same voter_authority.
/// Their token owner record will be required for withdrawing funds later.
pub fn create_voter(ctx: Context<CreateVoter>) -> Result<()> {
  // Forbid creating voter accounts from CPI. The goal is to make automation
  // impossible that weakens some of the limitations intentionally imposed on
  // locked tokens.
  {
    let ixns = ctx.accounts.instructions.to_account_info();
    let current_index = tx_instructions::load_current_index_checked(&ixns)? as usize;
    let current_ixn = tx_instructions::load_instruction_at_checked(current_index, &ixns)?;
    require_keys_eq!(
      current_ixn.program_id,
      *ctx.program_id,
      VsrError::ForbiddenCpi
    );
  }

  let signer_seeds: &[&[&[u8]]] = &[&[
    ctx.accounts.registrar.to_account_info().key.as_ref(),
    b"voter".as_ref(),
    ctx.accounts.voter_authority.to_account_info().key.as_ref(),
    &[ctx.bumps["voter"]],
  ]];

  token::mint_to(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.voter_token_account.to_account_info(),
        authority: ctx.accounts.voter.to_account_info(),
      },
      signer_seeds,
    ),
    1,
  )?;

  create_metadata_accounts_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.to_account_info().clone(),
      CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.mint.to_account_info().clone(),
        mint_authority: ctx.accounts.voter.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.voter.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: String::from("Voting Escrow Token Position"),
      symbol: String::from("VSR"),
      uri: format!("https://vsr-metadata.test-helium.com/{}", ctx.accounts.voter.key()),
      seller_fee_basis_points: 0,
      creators: None,
      collection: None,
      uses: None
    },
    true,
    true,
    None,
  )?;

  create_master_edition_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.to_account_info().clone(),
      CreateMasterEditionV3 {
        edition: ctx.accounts.master_edition.to_account_info().clone(),
        mint: ctx.accounts.mint.to_account_info().clone(),
        update_authority: ctx.accounts.voter.to_account_info().clone(),
        mint_authority: ctx.accounts.voter.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    Some(0)
  )?;

  // Load accounts.
  let registrar = &ctx.accounts.registrar.load()?;
  let voter_authority = ctx.accounts.voter_authority.key();

  let voter = &mut ctx.accounts.voter.load_init()?;
  voter.voter_bump = *ctx.bumps.get("voter").unwrap();
  voter.voter_weight_record_bump = *ctx.bumps.get("voter_weight_record").unwrap();
  voter.registrar = ctx.accounts.registrar.key();
  voter.mint = ctx.accounts.mint.key();

  let voter_weight_record = &mut ctx.accounts.voter_weight_record;
  voter_weight_record.account_discriminator =
    spl_governance_addin_api::voter_weight::VoterWeightRecord::ACCOUNT_DISCRIMINATOR;
  voter_weight_record.realm = registrar.realm;
  voter_weight_record.governing_token_mint = registrar.realm_governing_token_mint;
  voter_weight_record.governing_token_owner = voter_authority;

  Ok(())
}
