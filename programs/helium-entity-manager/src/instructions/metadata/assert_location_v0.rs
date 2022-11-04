use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};
use mpl_token_metadata::state::{Metadata, TokenMetadataAccount};
use std::str::FromStr;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct AssertLocationArgsV0 {
  pub location: String,
}

const DC_MINT: &str = "8po3rj3xE1wo5y38zW8gH2ZoTZzqowMAuD1ugBpUKj32";

#[derive(Accounts)]
#[instruction(args: AssertLocationArgsV0)]
pub struct AssertLocationV0<'info> {
  #[account(
    seeds = [
      "hotspot".as_bytes(),
      &storage.ecc_compact,
    ],
    bump
  )]
  pub hotspot: Box<Account<'info, Mint>>,
  #[account(
    seeds = [
      "storage".as_bytes(),
      hotspot.key().as_ref()
    ],
    bump
  )]
  pub storage: Box<Account<'info, HotspotStorageV0>>,
  pub hotspot_owner: Signer<'info>,
  #[account(
    associated_token::mint = hotspot,
    associated_token::authority = hotspot_owner,
    constraint = owner_hotspot_ata.amount == 1,
  )]
  pub owner_hotspot_ata: Box<Account<'info, TokenAccount>>,

  #[account(
    associated_token::mint = dc_mint,
    associated_token::authority = hotspot_owner,
  )]
  pub owner_dc_ata: Box<Account<'info, TokenAccount>>,

  /// CHECK: seeds checked and verification in handler
  #[account(
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), hotspot.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub hotspot_metadata: UncheckedAccount<'info>,

  #[account(
    seeds = ["hotspot_config".as_bytes(), hotspot_config.sub_dao.as_ref(), hotspot_config.symbol.as_bytes()],
    bump,
    // constraint = hotspot_config.collection == hotspot_metadata.collection.unwrap().key
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,

  #[account(
    mut,
    address=Pubkey::from_str(DC_MINT).unwrap()
  )]
  pub dc_mint: Box<Account<'info, Mint>>,

  /// CHECK: Checked with constraints
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub token_program: Program<'info, Token>,
}

impl<'info> AssertLocationV0<'info> {
  pub fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      mint: self.dc_mint.to_account_info(),
      from: self.owner_dc_ata.to_account_info(),
      authority: self.hotspot_owner.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<AssertLocationV0>, args: AssertLocationArgsV0) -> Result<()> {
  let metadata: Metadata =
    Metadata::from_account_info(&ctx.accounts.hotspot_metadata.to_account_info())?;
  require!(
    metadata.collection.unwrap().key == ctx.accounts.hotspot_config.collection,
    ErrorCode::InvalidHotspotCollection
  );

  let mut dc_fee: u32 = ctx.accounts.hotspot_config.dataonly_location_staking_fee;
  if ctx.accounts.storage.is_full_hotspot {
    dc_fee = ctx.accounts.hotspot_config.full_location_staking_fee;
  }

  // burn the dc tokens
  token::burn(ctx.accounts.burn_ctx(), dc_fee.into())?;

  let storage = &mut ctx.accounts.storage;
  storage.location = Some(args.location);
  storage.location_asserted = true;
  Ok(())
}
