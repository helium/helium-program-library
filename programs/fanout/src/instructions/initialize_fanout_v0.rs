use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::types::DataV2;
use shared_utils::{
  create_metadata_accounts_v3,
  token_metadata::{
    create_master_edition_v3, CreateMasterEditionV3, CreateMetadataAccountsV3, Metadata,
  },
};

use crate::FanoutV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeFanoutArgsV0 {
  pub name: String,
}

#[derive(Accounts)]
#[instruction(args: InitializeFanoutArgsV0)]
pub struct InitializeFanoutV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Deposit the collection
  pub authority: AccountInfo<'info>,

  #[account(
    init,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<FanoutV0>() + args.name.len(),
    seeds = ["fanout".as_bytes(), args.name.as_bytes()],
    bump
  )]
  pub fanout: Box<Account<'info, FanoutV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = fanout_mint,
    associated_token::authority = fanout,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  pub fanout_mint: Box<Account<'info, Mint>>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = fanout,
    mint::freeze_authority = fanout,
    seeds = ["collection".as_bytes(), fanout.key().as_ref()],
    bump
  )]
  pub collection: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = collection,
    associated_token::authority = authority,
  )]
  pub collection_account: Box<Account<'info, TokenAccount>>,
  pub membership_mint: Box<Account<'info, Mint>>,
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
  pub token_program: Program<'info, Token>,
  pub token_metadata_program: Program<'info, Metadata>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeFanoutV0>, args: InitializeFanoutArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[b"fanout", args.name.as_bytes(), &[ctx.bumps.fanout]]];

  token::mint_to(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      MintTo {
        mint: ctx.accounts.collection.to_account_info(),
        to: ctx.accounts.collection_account.to_account_info(),
        authority: ctx.accounts.fanout.to_account_info(),
      },
      signer_seeds,
    ),
    1,
  )?;

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
        mint_authority: ctx.accounts.fanout.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.fanout.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: args.name.clone(),
      symbol: String::from("FANOUT"),
      uri:
        "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/fanout.json"
          .to_string(),
      seller_fee_basis_points: 0,
      creators: None,
      collection: None,
      uses: None,
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
        mint: ctx.accounts.collection.to_account_info().clone(),
        update_authority: ctx.accounts.fanout.to_account_info().clone(),
        mint_authority: ctx.accounts.fanout.to_account_info().clone(),
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

  ctx.accounts.fanout.set_inner(FanoutV0 {
    authority: ctx.accounts.authority.key(),
    token_account: ctx.accounts.token_account.key(),
    membership_mint: ctx.accounts.membership_mint.key(),
    fanout_mint: ctx.accounts.fanout_mint.key(),
    membership_collection: ctx.accounts.collection.key(),
    name: args.name,
    total_shares: ctx.accounts.membership_mint.supply,
    total_staked_shares: 0,
    last_snapshot_amount: ctx.accounts.token_account.amount,
    total_inflow: ctx.accounts.token_account.amount,
    bump_seed: ctx.bumps.fanout,
  });

  Ok(())
}
