use crate::{dao_seeds, state::*};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{create_master_edition_v3, CreateMetadataAccountsV3, CreateMasterEditionV3};
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use helium_sub_daos::DaoV0;
use mpl_token_metadata::state::{Creator, DataV2};
use shared_utils::create_metadata_accounts_v3;

const NAME: &str = "iot_operations_fund";

#[derive(Accounts)]
pub struct IssueIotOperationsFundV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    has_one = authority
  )]
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
    space = 8 + std::mem::size_of::<KeyToAssetV0>() + 1 + String::from(NAME).into_bytes().len(),
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hash(&String::from(NAME).into_bytes()).to_bytes()
    ],
    bump
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  /// CHECK: Used in cpi
  pub recipient: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = recipient,
  )]
  pub receipt_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    constraint = mint.supply == 0,
    mint::decimals = 0,
    mint::authority = dao,
    mint::freeze_authority = dao,
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

  /// CHECK: Verified by constraint  
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> IssueIotOperationsFundV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.mint.to_account_info(),
      to: self.receipt_account.to_account_info(),
      authority: self.dao.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(
  ctx: Context<IssueIotOperationsFundV0>
) -> Result<()> {
  let asset_id = ctx.accounts.mint.key();
  token::mint_to(
    ctx
      .accounts
      .mint_ctx()
      .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
    1,
  )?;

  let entity_creator_seeds: &[&[u8]] = &[
    b"entity_creator",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    &[ctx.bumps["entity_creator"]],
  ];
  let signer_seeds: &[&[&[u8]]] = &[entity_creator_seeds, dao_seeds!(ctx.accounts.dao)];
  let mut creator = ctx.accounts.entity_creator.to_account_info();
  creator.is_signer = true;
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
        mint_authority: ctx.accounts.dao.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.dao.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    )
    .with_remaining_accounts(vec![creator]),
    DataV2 {
      name: String::from("IOT Operations Fund"),
      symbol: String::from("IOT OPS"),
      uri: String::from(""),
      seller_fee_basis_points: 0,
      creators: Some(vec![Creator {
        address: ctx.accounts.entity_creator.key(),
        verified: true,
        share: 100,
      }]),
      uses: None,
      collection: None,
    },
    true,
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
        update_authority: ctx.accounts.dao.to_account_info().clone(),
        mint_authority: ctx.accounts.dao.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    Some(0),
  )?;

  ctx.accounts.key_to_asset.set_inner(KeyToAssetV0 {
    asset: asset_id,
    dao: ctx.accounts.dao.key(),
    entity_key: String::from(NAME).into_bytes(),
    bump_seed: ctx.bumps["key_to_asset"],
  });

  Ok(())
}
