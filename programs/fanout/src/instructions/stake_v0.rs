use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount, Transfer},
};
use mpl_token_metadata::types::{Collection, DataV2};
use shared_utils::create_metadata_accounts_v3;
use shared_utils::token_metadata::{
  create_master_edition_v3, verify_collection_item, CreateMasterEditionV3,
  CreateMetadataAccountsV3, Metadata, VerifyCollectionItem,
};

use crate::{fanout_seeds, voucher_seeds, FanoutV0, FanoutVoucherV0};

#[cfg(feature = "devnet")]
const URL: &str = "https://fanout.nft.test-helium.com";

#[cfg(not(feature = "devnet"))]
const URL: &str = "https://fanout.nft.helium.io";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StakeArgsV0 {
  pub amount: u64,
}

/// Stake an amount of membership tokens and receive a receipt NFT
#[derive(Accounts)]
#[instruction(args: StakeArgsV0)]
pub struct StakeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub staker: Signer<'info>,
  /// CHECK: Just needed to receive nft
  pub recipient: AccountInfo<'info>,

  #[account(
    mut,
    has_one = membership_mint,
    has_one = token_account,
    has_one = membership_collection
  )]
  pub fanout: Box<Account<'info, FanoutV0>>,
  pub membership_mint: Box<Account<'info, Mint>>,
  pub token_account: Box<Account<'info, TokenAccount>>,
  pub membership_collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), membership_collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_metadata: UncheckedAccount<'info>,
  /// CHECK: Handled By cpi account
  #[account(
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), membership_collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_master_edition: UncheckedAccount<'info>,

  #[account(
    mut,
    associated_token::mint = membership_mint,
    associated_token::authority = staker,
  )]
  pub from_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = membership_mint,
    associated_token::authority = voucher,
  )]
  pub stake_account: Box<Account<'info, TokenAccount>>,

  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mint,
    associated_token::authority = recipient,
  )]
  pub receipt_account: Box<Account<'info, TokenAccount>>,

  #[account(
    init,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<FanoutVoucherV0>() + 1,
    seeds = ["fanout_voucher".as_bytes(), mint.key().as_ref()],
    bump,
  )]
  pub voucher: Box<Account<'info, FanoutVoucherV0>>,

  #[account(
    mut,
    constraint = mint.supply == 0,
    mint::decimals = 0,
    mint::authority = voucher,
    mint::freeze_authority = voucher,
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

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_metadata_program: Program<'info, Metadata>,
}

impl<'info> StakeV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.mint.to_account_info(),
      to: self.receipt_account.to_account_info(),
      authority: self.voucher.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn stake_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
      from: self.from_account.to_account_info(),
      to: self.stake_account.to_account_info(),
      authority: self.staker.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<StakeV0>, args: StakeArgsV0) -> Result<()> {
  // Create voucher
  ctx.accounts.voucher.set_inner(FanoutVoucherV0 {
    fanout: ctx.accounts.fanout.key(),
    mint: ctx.accounts.mint.key(),
    total_distributed: 0,
    shares: args.amount,
    stake_account: ctx.accounts.stake_account.key(),
    total_inflow: ctx.accounts.token_account.amount,
    total_dust: 0,
    bump_seed: ctx.bumps["voucher"],
  });
  ctx.accounts.fanout.total_staked_shares = ctx
    .accounts
    .fanout
    .total_staked_shares
    .checked_add(args.amount)
    .unwrap();

  // Stake tokens
  token::transfer(ctx.accounts.stake_ctx(), args.amount)?;

  // Create receipt nft
  let signer_seeds: &[&[&[u8]]] = &[voucher_seeds!(ctx.accounts.voucher)];
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
        mint: ctx.accounts.mint.to_account_info().clone(),
        mint_authority: ctx.accounts.voucher.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.voucher.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        token_metadata_program: ctx.accounts.token_metadata_program.clone(),
      },
      signer_seeds,
    ),
    DataV2 {
      name: format!("Staked {}", ctx.accounts.fanout.name),
      symbol: String::from("FANOUT"),
      uri: format!("{}/{}", URL, ctx.accounts.mint.key()),
      seller_fee_basis_points: 0,
      creators: None,
      collection: Some(Collection {
        key: ctx.accounts.fanout.membership_collection.key(),
        verified: false, // Verified in cpi
      }),
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
        mint: ctx.accounts.mint.to_account_info().clone(),
        update_authority: ctx.accounts.voucher.to_account_info().clone(),
        mint_authority: ctx.accounts.voucher.to_account_info().clone(),
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

  let verify_signer_seeds: &[&[&[u8]]] = &[fanout_seeds!(ctx.accounts.fanout)];

  verify_collection_item(CpiContext::new_with_signer(
    ctx
      .accounts
      .token_metadata_program
      .to_account_info()
      .clone(),
    VerifyCollectionItem {
      payer: ctx.accounts.payer.to_account_info().clone(),
      metadata: ctx.accounts.metadata.to_account_info().clone(),
      collection_authority: ctx.accounts.fanout.to_account_info().clone(),
      collection_mint: ctx.accounts.membership_collection.to_account_info().clone(),
      collection_metadata: ctx.accounts.collection_metadata.to_account_info().clone(),
      collection_master_edition: ctx
        .accounts
        .collection_master_edition
        .to_account_info()
        .clone(),
      token_metadata_program: ctx.accounts.token_metadata_program.clone(),
    },
    verify_signer_seeds,
  ))?;

  Ok(())
}
