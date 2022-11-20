use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use mpl_bubblegum::{program::Bubblegum, state::TreeConfig};
use spl_account_compression::program::SplAccountCompression;
use shared_utils::*;
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ChangeMetadataArgsV0 {
  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
  pub hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: ChangeMetadataArgsV0)]
pub struct ChangeMetadataV0<'info> {
  pub hotspot: Box<Account<'info, Mint>>,
  #[account(
    mut
  )]
  pub storage: Box<Account<'info, HotspotStorageV0>>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
   /// CHECK: THe merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  #[account(
        seeds = [merkle_tree.key().as_ref()],
        bump,
        seeds::program = bubblegum_program.key()
    )]
  pub tree_authority: Account<'info, TreeConfig>,
  #[account(
    mut,
    associated_token::mint = dc_mint,
    associated_token::authority = hotspot_owner,
  )]
  pub owner_dc_ata: Box<Account<'info, TokenAccount>>,
  
  #[account(
    seeds = ["hotspot_config".as_bytes(), hotspot_config.sub_dao.as_ref(), hotspot_config.symbol.as_bytes()],
    bump,
    has_one = dc_mint,
    has_one = merkle_tree,
    constraint = args.gain.is_none() || (args.gain.unwrap() <= hotspot_config.max_gain && args.gain.unwrap() >= hotspot_config.min_gain) @ ErrorCode::InvalidGain
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,

  #[account(
    mut,
  )]
  pub dc_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump,
    has_one = dc_mint
  )]
  pub dc: Account<'info, DataCreditsV0>,

  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  /// CHECK: Checked with constraints
  #[account(address = data_credits::ID)]
  pub data_credits_program: AccountInfo<'info>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
}

impl<'info> ChangeMetadataV0<'info> {
  pub fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnWithoutTrackingV0<'info>> {
    let cpi_accounts = BurnWithoutTrackingV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.owner_dc_ata.to_account_info(),
        owner: self.hotspot_owner.to_account_info(),
        dc_mint: self.dc_mint.to_account_info(),
        token_program: self.token_program.to_account_info(),
        associated_token_program: self.associated_token_program.to_account_info(),
        rent: self.rent.to_account_info(),
        system_program: self.system_program.to_account_info(),
      },
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, ChangeMetadataV0<'info>>, 
  args: ChangeMetadataArgsV0
) -> Result<()> {
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

  if args.location.is_some() {
    let mut dc_fee: u64 = ctx.accounts.hotspot_config.dataonly_location_staking_fee;
    if ctx.accounts.storage.is_full_hotspot {
      dc_fee = ctx.accounts.hotspot_config.full_location_staking_fee;
    }

    // burn the dc tokens
    burn_without_tracking_v0(
      ctx.accounts.burn_ctx(),
      BurnWithoutTrackingArgsV0 { amount: dc_fee },
    )?;
    ctx.accounts.storage.location = args.location;
  }
  if args.elevation.is_some() {
    ctx.accounts.storage.elevation = args.elevation;
  }
  if args.gain.is_some() {
    ctx.accounts.storage.gain = args.gain;
  }
  Ok(())
}
