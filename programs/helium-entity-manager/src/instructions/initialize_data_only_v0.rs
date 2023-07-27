use crate::error::ErrorCode;
use crate::{data_only_config_seeds, state::*};
use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use bubblegum_cpi::{
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
};
use helium_sub_daos::DaoV0;
use mpl_token_metadata::state::{CollectionDetails, DataV2, MAX_NAME_LENGTH, MAX_URI_LENGTH};
use shared_utils::create_metadata_accounts_v3;
use shared_utils::token_metadata::{
  create_master_edition_v3, CreateMasterEditionV3, CreateMetadataAccountsV3,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDataOnlyArgsV0 {
  pub authority: Pubkey,
  pub new_tree_depth: u32,
  pub new_tree_buffer_size: u32,
  pub new_tree_space: u64,
  pub new_tree_fee_lamports: u64,
  pub name: String,
  pub metadata_url: String,
}

#[derive(Accounts)]
#[instruction(args: InitializeDataOnlyArgsV0)]
pub struct InitializeDataOnlyV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(
    init,
    space = 8 + 60 + std::mem::size_of::<DataOnlyConfigV0>(),
    payer = authority,
    seeds = ["data_only_config".as_bytes(), dao.key().as_ref()],
    bump,
  )]
  pub data_only_config: Box<Account<'info, DataOnlyConfigV0>>,
  #[account(has_one = authority)]
  pub dao: Account<'info, DaoV0>,
  #[account(
    mut,
    seeds = [merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  /// CHECK: Checked by cpi
  pub tree_authority: AccountInfo<'info>,

  /// CHECK: Checked by cpi
  #[account(mut)]
  pub merkle_tree: AccountInfo<'info>,

  #[account(
    init,
    payer = authority,
    mint::decimals = 0,
    mint::authority = data_only_config,
    mint::freeze_authority = data_only_config,
    seeds = ["collection".as_bytes(), data_only_config.key().as_ref()],
    bump
  )]
  pub collection: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = authority,
    associated_token::mint = collection,
    associated_token::authority = data_only_config,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub master_edition: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub metadata: UncheckedAccount<'info>,
  /// CHECK: Checked with constraints
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeDataOnlyV0>, args: InitializeDataOnlyArgsV0) -> Result<()> {
  require!(
    args.name.len() <= MAX_NAME_LENGTH,
    ErrorCode::InvalidStringLength
  );
  require!(
    args.metadata_url.len() <= MAX_URI_LENGTH,
    ErrorCode::InvalidStringLength
  );

  let dao = ctx.accounts.dao.key();
  ctx.accounts.data_only_config.set_inner(DataOnlyConfigV0 {
    authority: args.authority,
    collection: ctx.accounts.collection.key(),
    merkle_tree: Pubkey::default(),
    bump_seed: ctx.bumps["data_only_config"],
    collection_bump_seed: ctx.bumps["collection"],
    dao,
    new_tree_depth: args.new_tree_depth,
    new_tree_buffer_size: args.new_tree_buffer_size,
    new_tree_space: args.new_tree_space,
    new_tree_fee_lamports: args.new_tree_fee_lamports,
  });
  let signer_seeds: &[&[&[u8]]] = &[data_only_config_seeds!(ctx.accounts.data_only_config)];

  token::mint_to(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      MintTo {
        mint: ctx.accounts.collection.to_account_info(),
        to: ctx.accounts.token_account.to_account_info(),
        authority: ctx.accounts.data_only_config.to_account_info(),
      },
    )
    .with_signer(signer_seeds),
    1,
  )?;

  create_metadata_accounts_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.collection.to_account_info().clone(),
        mint_authority: ctx.accounts.data_only_config.to_account_info().clone(),
        payer: ctx.accounts.authority.to_account_info().clone(),
        update_authority: ctx.accounts.data_only_config.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: args.name.clone(),
      symbol: "DATAONLY".to_string(),
      uri: args.metadata_url,
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
        update_authority: ctx.accounts.data_only_config.to_account_info().clone(),
        mint_authority: ctx.accounts.data_only_config.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.authority.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds,
    ),
    Some(0),
  )?;

  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.authority.to_account_info().clone(),
        tree_creator: ctx.accounts.data_only_config.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
      signer_seeds,
    ),
    args.new_tree_depth,
    args.new_tree_buffer_size,
    None,
  )?;
  ctx.accounts.data_only_config.merkle_tree = ctx.accounts.merkle_tree.key();
  Ok(())
}
