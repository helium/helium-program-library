use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use helium_sub_daos::{DaoV0, SubDaoV0};
use mpl_bubblegum::utils::get_asset_id;
use mpl_bubblegum::{program::Bubblegum, state::TreeConfig};
use shared_utils::*;
use spl_account_compression::program::SplAccountCompression;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateIotInfoArgsV0 {
  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
  pub hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

impl ConfigSettingsV0 {
  pub fn is_valid(self, args: UpdateIotInfoArgsV0) -> bool {
    match (args.gain, self) {
      (
        Some(gain),
        ConfigSettingsV0::IotConfig {
          max_gain, min_gain, ..
        },
      ) => gain <= max_gain && gain >= min_gain,
      _ => true,
    }
  }
}

#[derive(Accounts)]
#[instruction(args: UpdateIotInfoArgsV0)]
pub struct UpdateIotInfoV0<'info> {
  #[account(
    mut,
    constraint = info.asset == get_asset_id(&merkle_tree.key(), u64::try_from(args.index).unwrap())
  )]
  pub info: Box<Account<'info, IotHotspotInfoV0>>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  /// CHECK: The merkle tree
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
    has_one = merkle_tree,
    has_one = sub_dao,
    constraint = hotspot_config.settings.is_valid(args)
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
  #[account(
    has_one = dc_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao
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

  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  /// CHECK: Checked with constraints
  #[account(address = data_credits::ID)]
  pub data_credits_program: AccountInfo<'info>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

impl<'info> UpdateIotInfoV0<'info> {
  pub fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnWithoutTrackingV0<'info>> {
    let cpi_accounts = BurnWithoutTrackingV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.owner_dc_ata.to_account_info(),
        owner: self.hotspot_owner.to_account_info(),
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
  ctx: Context<'_, '_, '_, 'info, UpdateIotInfoV0<'info>>,
  args: UpdateIotInfoArgsV0,
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

  if let (
    Some(location),
    ConfigSettingsV0::IotConfig {
      full_location_staking_fee,
      dataonly_location_staking_fee,
      ..
    },
  ) = (args.location, ctx.accounts.hotspot_config.settings)
  {
    let mut dc_fee: u64 = dataonly_location_staking_fee;
    if ctx.accounts.info.is_full_hotspot {
      dc_fee = full_location_staking_fee;
    }

    ctx.accounts.info.num_location_asserts = ctx
      .accounts
      .info
      .num_location_asserts
      .checked_add(1)
      .unwrap();

    // burn the dc tokens
    burn_without_tracking_v0(
      ctx.accounts.burn_ctx(),
      BurnWithoutTrackingArgsV0 { amount: dc_fee },
    )?;
    ctx.accounts.info.location = Some(location);
  }

  if args.elevation.is_some() {
    ctx.accounts.info.elevation = args.elevation;
  }
  if args.gain.is_some() {
    ctx.accounts.info.gain = args.gain;
  }
  Ok(())
}
