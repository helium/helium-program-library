use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use helium_sub_daos::DaoV0;
use mpl_token_metadata::types::{CollectionDetails, DataV2};
use shared_utils::{
  create_metadata_accounts_v3,
  token_metadata::{create_master_edition_v3, CreateMasterEditionV3, CreateMetadataAccountsV3},
  Metadata,
};

use crate::{error::ErrorCode, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeMakerArgsV0 {
  pub update_authority: Pubkey,
  pub issuing_authority: Pubkey,
  pub name: String,
  pub metadata_url: String,
  pub topup_amounts: Vec<TopupAmountV0>,
}

#[derive(Accounts)]
#[instruction(args: InitializeMakerArgsV0)]
pub struct InitializeMakerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<MakerV0>(),
    seeds = ["maker".as_bytes(), dao.key().as_ref(), args.name.as_bytes()],
    bump,
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = maker,
    mint::freeze_authority = maker,
    seeds = ["collection".as_bytes(), maker.key().as_ref()],
    bump
  )]
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub metadata: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub master_edition: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    associated_token::mint = collection,
    associated_token::authority = maker,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,

  pub token_metadata_program: Program<'info, Metadata>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
}

impl<'info> InitializeMakerV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.collection.to_account_info(),
      to: self.token_account.to_account_info(),
      authority: self.maker.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

#[allow(deprecated)]
pub fn handler(ctx: Context<InitializeMakerV0>, args: InitializeMakerArgsV0) -> Result<()> {
  require!(args.name.len() <= 32, ErrorCode::InvalidStringLength);
  require!(
    args.metadata_url.len() <= 200,
    ErrorCode::InvalidStringLength
  );

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"maker",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    args.name.as_bytes(),
    &[ctx.bumps["maker"]],
  ]];

  token::mint_to(ctx.accounts.mint_ctx().with_signer(signer_seeds), 1)?;

  create_metadata_accounts_v3(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.collection.to_account_info().clone(),
        mint_authority: ctx.accounts.maker.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.maker.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: args.name.clone(),
      symbol: "MAKER".to_string(),
      uri: args.metadata_url,
      seller_fee_basis_points: 0,
      creators: None,
      collection: None,
      uses: None,
    },
    true,
    Some(CollectionDetails::V1 { size: 0 }),
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
        mint: ctx.accounts.collection.to_account_info().clone(),
        update_authority: ctx.accounts.maker.to_account_info().clone(),
        mint_authority: ctx.accounts.maker.to_account_info().clone(),
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

  ctx.accounts.maker.set_inner(MakerV0 {
    name: args.name,
    issuing_authority: args.issuing_authority,
    update_authority: args.update_authority,
    collection: ctx.accounts.collection.key(),
    merkle_tree: Pubkey::default(),
    // Initialized via set_maker_tree
    bump_seed: ctx.bumps["maker"],
    collection_bump_seed: ctx.bumps["collection"],
    dao: ctx.accounts.dao.key(),
    topup_amounts: args.topup_amounts,
  });

  Ok(())
}
