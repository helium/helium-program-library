use crate::error::ErrorCode;
use crate::{routing_manager_seeds, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use helium_sub_daos::{DaoV0, SubDaoV0};
use mpl_token_metadata::types::{CollectionDetails, DataV2};
use shared_utils::create_metadata_accounts_v3;
use shared_utils::token_metadata::{
  create_master_edition_v3, CreateMasterEditionV3, CreateMetadataAccountsV3,
  Metadata as MetadataProgram,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeRoutingManagerArgsV0 {
  pub metadata_url: String,
  pub devaddr_fee_usd: u64,
  pub oui_fee_usd: u64,
}

#[derive(Accounts)]
#[instruction(args: InitializeRoutingManagerArgsV0)]
pub struct InitializeRoutingManagerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  /// CHECK: Set on the struct
  pub update_authority: UncheckedAccount<'info>,
  /// CHECK: Set on the struct
  pub net_id_authority: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + IotRoutingManagerV0::INIT_SPACE,
    seeds = ["routing_manager".as_bytes(), sub_dao.key().as_ref()],
    bump,
  )]
  pub routing_manager: Box<Account<'info, IotRoutingManagerV0>>,
  #[account(
    has_one = dc_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = authority,
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = routing_manager,
    mint::freeze_authority = routing_manager,
    seeds = ["collection".as_bytes(), routing_manager.key().as_ref()],
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
    associated_token::authority = routing_manager,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,

  pub token_metadata_program: Program<'info, MetadataProgram>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> InitializeRoutingManagerV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.collection.to_account_info(),
      to: self.token_account.to_account_info(),
      authority: self.routing_manager.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

#[allow(deprecated)]
pub fn handler(
  ctx: Context<InitializeRoutingManagerV0>,
  args: InitializeRoutingManagerArgsV0,
) -> Result<()> {
  require!(
    args.metadata_url.len() <= 200,
    ErrorCode::InvalidStringLength
  );

  ctx.accounts.routing_manager.set_inner(IotRoutingManagerV0 {
    update_authority: ctx.accounts.update_authority.key(),
    net_id_authority: ctx.accounts.net_id_authority.key(),
    collection: ctx.accounts.collection.key(),
    // Initialized via set_carrier_tree
    bump_seed: ctx.bumps["routing_manager"],
    dc_mint: ctx.accounts.dc_mint.key(),
    sub_dao: ctx.accounts.sub_dao.key(),
    devaddr_fee_usd: args.devaddr_fee_usd,
    oui_fee_usd: args.oui_fee_usd,
    next_oui_id: 1,
  });

  let signer_seeds: &[&[&[u8]]] = &[routing_manager_seeds!(ctx.accounts.routing_manager)];
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
        mint_authority: ctx.accounts.routing_manager.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.routing_manager.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: "IOT Routing Manager Collection".to_string(),
      symbol: "RM".to_string(),
      uri: args.metadata_url.clone(),
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
        update_authority: ctx.accounts.routing_manager.to_account_info().clone(),
        mint_authority: ctx.accounts.routing_manager.to_account_info().clone(),
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

  Ok(())
}
