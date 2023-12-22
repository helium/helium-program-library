use crate::constants::ENTITY_METADATA_URL;
use crate::{key_to_asset_seeds, state::*};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use helium_sub_daos::DaoV0;
use mpl_token_metadata::instructions::{VerifyCreatorV1Cpi, VerifyCreatorV1CpiAccounts};
use mpl_token_metadata::types::{Creator, DataV2};
use no_emit::program::NoEmit;
use shared_utils::token_metadata::{
  create_master_edition_v3, CreateMasterEditionV3, CreateMetadataAccountsV3,
};
use shared_utils::{create_metadata_accounts_v3, Metadata};

pub const NOT_EMITTED: &str = "not_emitted";

#[derive(Accounts)]
pub struct IssueNotEmittedEntityV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  /// CHECK: Signs as a verified creator to make searching easier
  #[account(
    seeds = [b"entity_creator", dao.key().as_ref()],
    bump,
  )]
  pub entity_creator: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<KeyToAssetV0>() + 1 + NOT_EMITTED.len(),
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hash(&String::from(NOT_EMITTED).into_bytes()).to_bytes()
    ],
    bump
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  /// CHECK: Checked by seeds
  #[account(
    mut,
    seeds = [b"not_emitted"],
    bump,
    seeds::program = no_emit_program.key()
  )]
  pub recipient: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = recipient,
  )]
  pub recipient_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    constraint = mint.supply == 0,
    mint::decimals = 0,
    mint::authority = authority,
    mint::freeze_authority = authority,
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

  pub token_metadata_program: Program<'info, Metadata>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  /// CHECK: Should be checked by the metaplex instruction
  pub instructions: UncheckedAccount<'info>,
  pub no_emit_program: Program<'info, NoEmit>,
}

impl<'info> IssueNotEmittedEntityV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.mint.to_account_info(),
      to: self.recipient_account.to_account_info(),
      authority: self.authority.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<IssueNotEmittedEntityV0>) -> Result<()> {
  let asset_id = ctx.accounts.mint.key();
  msg!("minting");
  token::mint_to(ctx.accounts.mint_ctx(), 1)?;

  let entity_creator_seeds: &[&[u8]] = &[
    b"entity_creator",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    &[ctx.bumps["entity_creator"]],
  ];
  let mut update_auth = ctx.accounts.entity_creator.to_account_info().clone();
  update_auth.is_signer = true;
  let signer_seeds: &[&[&[u8]]] = &[entity_creator_seeds];

  create_metadata_accounts_v3(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.mint.to_account_info().clone(),
        mint_authority: ctx.accounts.authority.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: update_auth.clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: String::from("Not Emitted Entity"),
      symbol: String::from("NOEMIT"),
      uri: format!(
        "{}/v2/hotspot/{}",
        ENTITY_METADATA_URL,
        ctx.accounts.key_to_asset.key()
      ),
      seller_fee_basis_points: 0,
      creators: Some(vec![
        Creator {
          address: ctx.accounts.entity_creator.key(),
          verified: true,
          share: 100,
        },
        Creator {
          address: ctx.accounts.key_to_asset.key(),
          verified: false,
          share: 0,
        },
      ]),
      uses: None,
      collection: None,
    },
    true,
    None,
  )?;

  create_master_edition_v3(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      CreateMasterEditionV3 {
        edition: ctx.accounts.master_edition.to_account_info().clone(),
        mint: ctx.accounts.mint.to_account_info().clone(),
        update_authority: update_auth,
        mint_authority: ctx.accounts.authority.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    Some(0),
  )?;

  ctx.accounts.key_to_asset.set_inner(KeyToAssetV0 {
    asset: asset_id,
    dao: ctx.accounts.dao.key(),
    entity_key: String::from(NOT_EMITTED).into_bytes(),
    bump_seed: ctx.bumps["key_to_asset"],
    key_serialization: KeySerialization::UTF8,
  });

  let mut key_to_asset_creator = ctx.accounts.key_to_asset.to_account_info();
  key_to_asset_creator.is_signer = true;
  let key_to_asset_signer: &[&[u8]] = key_to_asset_seeds!(ctx.accounts.key_to_asset);
  VerifyCreatorV1Cpi::new(
    &ctx
      .accounts
      .token_metadata_program
      .to_account_info()
      .clone(),
    VerifyCreatorV1CpiAccounts {
      authority: &key_to_asset_creator,
      delegate_record: None,
      metadata: &ctx.accounts.metadata.to_account_info(),
      collection_mint: None,
      collection_metadata: None,
      collection_master_edition: None,
      system_program: &ctx.accounts.system_program.to_account_info(),
      sysvar_instructions: &ctx.accounts.instructions.to_account_info(),
    },
  )
  .invoke_signed(&[key_to_asset_signer])?;

  Ok(())
}
