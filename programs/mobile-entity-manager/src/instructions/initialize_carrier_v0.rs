use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Transfer;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use helium_sub_daos::SubDaoV0;
use mpl_token_metadata::state::{CollectionDetails, DataV2};
use shared_utils::create_metadata_accounts_v3;
use shared_utils::token_metadata::{
  create_master_edition_v3, CreateMasterEditionV3, CreateMetadataAccountsV3,
};

// 500m MOBILE
pub const CARRIER_STAKE_AMOUNT: u64 = 500_000_000_000_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeCarrierArgsV0 {
  pub update_authority: Pubkey,
  pub issuing_authority: Pubkey,
  pub name: String,
  pub metadata_url: String,
}

#[derive(Accounts)]
#[instruction(args: InitializeCarrierArgsV0)]
pub struct InitializeCarrierV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<CarrierV0>(),
    seeds = ["carrier".as_bytes(), sub_dao.key().as_ref(), args.name.as_bytes()],
    bump,
  )]
  pub carrier: Box<Account<'info, CarrierV0>>,
  #[account(
    has_one = dnt_mint
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub dnt_mint: Box<Account<'info, Mint>>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = carrier,
    mint::freeze_authority = carrier,
    seeds = ["collection".as_bytes(), carrier.key().as_ref()],
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
    init_if_needed,
    payer = payer,
    associated_token::mint = collection,
    associated_token::authority = carrier,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::mint = dnt_mint,
    associated_token::authority = payer,
  )]
  pub source: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dnt_mint,
    associated_token::authority = carrier,
  )]
  pub escrow: Box<Account<'info, TokenAccount>>,

  /// CHECK: Checked with constraints
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> InitializeCarrierV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.collection.to_account_info(),
      to: self.token_account.to_account_info(),
      authority: self.carrier.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn transfer_escrow_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
      from: self.source.to_account_info(),
      to: self.escrow.to_account_info(),
      authority: self.payer.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

#[allow(clippy::deprecated)]
pub fn handler(ctx: Context<InitializeCarrierV0>, args: InitializeCarrierArgsV0) -> Result<()> {
  require!(args.name.len() <= 32, ErrorCode::InvalidStringLength);
  require!(
    args.metadata_url.len() <= 200,
    ErrorCode::InvalidStringLength
  );

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"carrier",
    ctx.accounts.sub_dao.to_account_info().key.as_ref(),
    args.name.as_bytes(),
    &[ctx.bumps["carrier"]],
  ]];

  token::mint_to(ctx.accounts.mint_ctx().with_signer(signer_seeds), 1)?;

  create_metadata_accounts_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.collection.to_account_info().clone(),
        mint_authority: ctx.accounts.carrier.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.carrier.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: args.name.clone(),
      symbol: "CARRIER".to_string(),
      uri: args.metadata_url.clone(),
      seller_fee_basis_points: 0,
      creators: None,
      collection: None,
      uses: None,
    },
    true,
    true,
    Some(CollectionDetails::V1 { size: 0 }),
  )?;

  create_master_edition_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      CreateMasterEditionV3 {
        edition: ctx.accounts.master_edition.to_account_info().clone(),
        mint: ctx.accounts.collection.to_account_info().clone(),
        update_authority: ctx.accounts.carrier.to_account_info().clone(),
        mint_authority: ctx.accounts.carrier.to_account_info().clone(),
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

  token::transfer(ctx.accounts.transfer_escrow_ctx(), CARRIER_STAKE_AMOUNT)?;

  ctx.accounts.carrier.set_inner(CarrierV0 {
    name: args.name,
    issuing_authority: args.issuing_authority,
    update_authority: args.update_authority,
    collection: ctx.accounts.collection.key(),
    merkle_tree: Pubkey::default(),
    /// Initialized via set_carrier_tree
    bump_seed: ctx.bumps["carrier"],
    collection_bump_seed: ctx.bumps["collection"],
    sub_dao: ctx.accounts.sub_dao.key(),
    escrow: ctx.accounts.escrow.key(),
    approved: false,
  });

  Ok(())
}
