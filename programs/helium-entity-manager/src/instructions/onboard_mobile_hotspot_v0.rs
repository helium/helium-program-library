use std::mem::size_of;

use crate::state::*;
use anchor_lang::{prelude::*, solana_program::hash::hash};

use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use helium_sub_daos::{DaoV0, SubDaoV0};

use mpl_bubblegum::utils::get_asset_id;
use shared_utils::*;
use spl_account_compression::program::SplAccountCompression;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OnboardMobileHotspotArgsV0 {
  pub hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: OnboardMobileHotspotArgsV0)]
pub struct OnboardMobileHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub dc_fee_payer: Signer<'info>,
  pub issuing_authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + size_of::<MobileHotspotInfoV0>(),
    seeds = [
      b"mobile_info", 
      rewardable_entity_config.key().as_ref(),
      &hash(&key_to_asset.entity_key[..]).to_bytes()
    ],
    bump,
  )]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  /// CHECK: The merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  #[account(
    mut,
    associated_token::mint = dc_mint,
    associated_token::authority = dc_fee_payer,
  )]
  pub dc_burner: Box<Account<'info, TokenAccount>>,

  #[account(
    has_one = sub_dao,
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump = maker_approval.bump_seed,
    has_one = maker,
    has_one = rewardable_entity_config,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  #[account(
    has_one = merkle_tree,
    has_one = issuing_authority
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    has_one = dc_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    constraint = get_asset_id(&merkle_tree.key(), args.index.into()) == key_to_asset.asset,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  #[account(
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump = dc.data_credits_bump,
    has_one = dc_mint
  )]
  pub dc: Account<'info, DataCreditsV0>,

  pub compression_program: Program<'info, SplAccountCompression>,
  pub data_credits_program: Program<'info, DataCredits>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

impl<'info> OnboardMobileHotspotV0<'info> {
  pub fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnWithoutTrackingV0<'info>> {
    let cpi_accounts = BurnWithoutTrackingV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.dc_burner.to_account_info(),
        owner: self.dc_fee_payer.to_account_info(),
        dc_mint: self.dc_mint.to_account_info(),
        token_program: self.token_program.to_account_info(),
        associated_token_program: self.associated_token_program.to_account_info(),
        system_program: self.system_program.to_account_info(),
      },
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, OnboardMobileHotspotV0<'info>>,
  args: OnboardMobileHotspotArgsV0,
) -> Result<()> {
  let asset_id = get_asset_id(
    &ctx.accounts.merkle_tree.key(),
    u64::try_from(args.index).unwrap(),
  );

  verify_compressed_nft(VerifyCompressedNftArgs {
    hash: args.hash,
    root: args.root,
    index: args.index,
    compression_program: ctx.accounts.compression_program.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    owner: ctx.accounts.hotspot_owner.owner.key(),
    delegate: ctx.accounts.hotspot_owner.owner.key(),
    proof_accounts: ctx.remaining_accounts.to_vec(),
  })?;

  // burn the dc tokens
  burn_without_tracking_v0(
    ctx.accounts.burn_ctx(),
    BurnWithoutTrackingArgsV0 {
      amount: ctx.accounts.sub_dao.onboarding_dc_fee,
    },
  )?;

  ctx.accounts.mobile_info.set_inner(MobileHotspotInfoV0 {
    asset: asset_id,
    bump_seed: ctx.bumps["mobile_info"],
    location: None,
    is_full_hotspot: true,
    num_location_asserts: 0,
  });

  Ok(())
}
