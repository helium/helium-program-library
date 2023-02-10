use std::cmp::min;

use crate::constants::HOTSPOT_METADATA_URL;
use crate::error::ErrorCode;
use crate::{id, state::*};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::system_instruction::{self, create_account};
use anchor_spl::token::Mint;
use angry_purple_tiger::AnimalName;
use helium_sub_daos::DaoV0;
use mpl_bubblegum::state::metaplex_adapter::{Collection, MetadataArgs, TokenProgramVersion};
use mpl_bubblegum::state::metaplex_adapter::{Creator, TokenStandard};
use mpl_bubblegum::utils::get_asset_id;
use mpl_bubblegum::{
  cpi::{accounts::MintToCollectionV1, mint_to_collection_v1},
  program::Bubblegum,
  state::TreeConfig,
};
use spl_account_compression::{program::SplAccountCompression, Noop};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GenesisIssueHotspotArgsV0 {
  pub entity_key: Vec<u8>,
  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
  pub is_full_hotspot: bool,
  pub num_location_asserts: u16,
}

#[derive(Accounts)]
#[instruction(args: GenesisIssueHotspotArgsV0)]
pub struct GenesisIssueHotspotV0<'info> {
  #[account(
    mut,
    seeds = [b"lazy_signer", b"devnethelium5"],
    seeds::program = lazy_transactions::ID,
    bump,
  )]
  pub lazy_signer: Signer<'info>,
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(mut)]
  pub collection_metadata: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  pub collection_master_edition: UncheckedAccount<'info>,
  #[account(
    has_one = collection,
    has_one = merkle_tree
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  /// CHECK: We trust the lazy signer, don't need to verify this account, it's just used in the seeds of iot info.
  /// Not passing it as an arg because lookup table will compress this to 1 byte.
  pub rewardable_entity_config: UncheckedAccount<'info>,
  /// CHECK: Signs as a verified creator to make searching easier
  #[account(
    seeds = [b"entity_creator", dao.key().as_ref()],
    bump,
  )]
  pub entity_creator: UncheckedAccount<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    init,
    payer = lazy_signer,
    space = 8 + std::mem::size_of::<KeyToAssetV0>() + 8 * args.entity_key.len(),
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hash(&args.entity_key[..]).to_bytes()
    ],
    bump
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  #[account(
    init,
    payer = lazy_signer,
    space = IOT_HOTSPOT_INFO_SIZE,
    seeds = [
      "iot_info".as_bytes(),
      rewardable_entity_config.key().as_ref(),
      &hash(&args.entity_key[..]).to_bytes()
    ],
    bump
  )]
  pub info: Box<Account<'info, IotHotspotInfoV0>>,
  /// CHECK: Handled by cpi
  #[account(mut)]
  pub tree_authority: Account<'info, TreeConfig>,
  /// CHECK: Used in cpi
  pub recipient: AccountInfo<'info>,
  /// CHECK: Used in cpi
  #[account(mut)]
  pub merkle_tree: AccountInfo<'info>,
  #[account(
    seeds = ["collection_cpi".as_bytes()],
    seeds::program = bubblegum_program.key(),
    bump,
  )]
  /// CHECK: Used in cpi
  pub bubblegum_signer: UncheckedAccount<'info>,

  /// CHECK: Verified by constraint  
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
}

impl<'info> GenesisIssueHotspotV0<'info> {
  fn mint_to_collection_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintToCollectionV1<'info>> {
    let cpi_accounts = MintToCollectionV1 {
      tree_authority: self.tree_authority.to_account_info(),
      leaf_delegate: self.recipient.to_account_info(),
      leaf_owner: self.recipient.to_account_info(),
      merkle_tree: self.merkle_tree.to_account_info(),
      payer: self.lazy_signer.to_account_info(),
      tree_delegate: self.maker.to_account_info(),
      log_wrapper: self.log_wrapper.to_account_info(),
      compression_program: self.compression_program.to_account_info(),
      system_program: self.system_program.to_account_info(),
      collection_authority: self.maker.to_account_info(),
      collection_authority_record_pda: self.bubblegum_program.to_account_info(),
      collection_mint: self.collection.to_account_info(),
      collection_metadata: self.collection_metadata.to_account_info(),
      edition_account: self.collection_master_edition.to_account_info(),
      bubblegum_signer: self.bubblegum_signer.to_account_info(),
      token_metadata_program: self.token_metadata_program.to_account_info(),
    };
    CpiContext::new(self.bubblegum_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, GenesisIssueHotspotV0<'info>>,
  args: GenesisIssueHotspotArgsV0,
) -> Result<()> {
  let asset_id = get_asset_id(
    &ctx.accounts.merkle_tree.key(),
    ctx.accounts.tree_authority.num_minted,
  );
  let key_str = bs58::encode(args.entity_key.clone()).into_string();

  let animal_name: AnimalName = key_str
    .parse()
    .map_err(|_| error!(ErrorCode::InvalidEccCompact))?;

  let maker_seeds: &[&[&[u8]]] = &[&[
    b"maker",
    ctx.accounts.maker.dao.as_ref(),
    ctx.accounts.maker.name.as_bytes(),
    &[ctx.accounts.maker.bump_seed],
  ]];

  let name = animal_name.to_string();
  let metadata = MetadataArgs {
    name: name[..min(name.len(), 32)].to_owned(),
    symbol: String::from("HOTSPOT"),
    uri: format!("{}/{}", HOTSPOT_METADATA_URL, key_str),
    collection: Some(Collection {
      key: ctx.accounts.collection.key(),
      verified: false, // Verified in cpi
    }),
    primary_sale_happened: true,
    is_mutable: true,
    edition_nonce: None,
    token_standard: Some(TokenStandard::NonFungible),
    uses: None,
    token_program_version: TokenProgramVersion::Original,
    creators: vec![Creator {
      address: ctx.accounts.entity_creator.key(),
      verified: true,
      share: 100,
    }],
    seller_fee_basis_points: 0,
  };
  let entity_creator_seeds: &[&[&[u8]]] = &[&[
    b"entity_creator",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    &[ctx.bumps["entity_creator"]],
  ]];
  let mut creator = ctx.accounts.entity_creator.to_account_info();
  creator.is_signer = true;
  mint_to_collection_v1(
    ctx
      .accounts
      .mint_to_collection_ctx()
      .with_remaining_accounts(vec![creator])
      .with_signer(&[maker_seeds[0], entity_creator_seeds[0]]),
    metadata,
  )?;

  ctx.accounts.key_to_asset.set_inner(KeyToAssetV0 {
    asset: asset_id,
    entity_key: args.entity_key.clone(),
    dao: ctx.accounts.dao.key(),
    bump_seed: ctx.bumps["key_to_asset"],
  });

  ctx.accounts.info.set_inner(IotHotspotInfoV0 {
    asset: asset_id,
    location: args.location,
    bump_seed: ctx.bumps["info"],
    elevation: args.elevation,
    gain: args.gain,
    is_full_hotspot: args.is_full_hotspot,
    num_location_asserts: args.num_location_asserts,
  });

  // The remaining account should be the mobile info if this
  // is a mobile hotspot as well
  if !ctx.remaining_accounts.is_empty() {
    let mobile_rewardable_entity_config = &ctx.remaining_accounts[0];
    let account_info: &AccountInfo<'info> = &ctx.remaining_accounts[1];
    let hash = hash(&args.entity_key).to_bytes();
    let seeds = &[
      b"mobile_info",
      mobile_rewardable_entity_config.key.as_ref(),
      &hash,
    ];
    let (address, bump_seed) = Pubkey::find_program_address(seeds, &id());
    require_eq!(address, account_info.key());

    let serialized_data = MobileHotspotInfoV0 {
      asset: asset_id,
      location: args.location,
      num_location_asserts: args.num_location_asserts,
      is_full_hotspot: args.is_full_hotspot,
      bump_seed,
    }
    .try_to_vec()?;
    let account_size = MOBILE_HOTSPOT_INFO_SIZE;

    let mut signers_seeds = seeds.to_vec();
    let bump = &[bump_seed];
    signers_seeds.push(bump);

    let rent = Rent::get()?;
    let total_lamports = rent.minimum_balance(account_size);
    let payer_info = ctx.accounts.lazy_signer.to_account_info();
    let system_info = ctx.accounts.system_program.to_account_info();

    // If the account has some lamports already it can't be created using create_account instruction
    // Anybody can send lamports to a PDA and by doing so create the account and perform DoS attack by blocking create_account
    if account_info.lamports() > 0 {
      let top_up_lamports = total_lamports.saturating_sub(account_info.lamports());

      if top_up_lamports > 0 {
        invoke(
          &system_instruction::transfer(payer_info.key, account_info.key, top_up_lamports),
          &[
            payer_info.clone(),
            account_info.clone(),
            system_info.clone(),
          ],
        )?;
      }

      invoke_signed(
        &system_instruction::allocate(account_info.key, account_size as u64),
        &[account_info.clone(), system_info.clone()],
        &[&signers_seeds[..]],
      )?;

      invoke_signed(
        &system_instruction::assign(account_info.key, &id()),
        &[account_info.clone(), system_info.clone()],
        &[&signers_seeds[..]],
      )?;
    } else {
      // If the PDA doesn't exist use create_account to use lower compute budget
      let create_account_instruction = create_account(
        payer_info.key,
        account_info.key,
        total_lamports,
        account_size as u64,
        &id(),
      );

      invoke_signed(
        &create_account_instruction,
        &[
          payer_info.clone(),
          account_info.clone(),
          system_info.clone(),
        ],
        &[&signers_seeds[..]],
      )?;
    }

    account_info.data.borrow_mut()[..serialized_data.len()].copy_from_slice(&serialized_data);
  }

  Ok(())
}
