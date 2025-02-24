use crate::{error::ErrorCode, net_id_seeds, routing_manager_seeds, state::*};
use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use bubblegum_cpi::program::Bubblegum;
use bubblegum_cpi::TreeConfig;
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use helium_entity_manager::program::HeliumEntityManager;
use helium_entity_manager::{
  cpi::accounts::IssueProgramEntityV0, cpi::issue_program_entity_v0, ProgramApprovalV0,
};
use helium_entity_manager::{IssueProgramEntityArgsV0, KeySerialization, SharedMerkleV0};
use helium_sub_daos::{DaoV0, SubDaoV0};

#[cfg(feature = "devnet")]
pub const ENTITY_METADATA_URL: &str = "https://entities.nft.test-helium.com";

#[cfg(not(feature = "devnet"))]
pub const ENTITY_METADATA_URL: &str = "https://entities.nft.helium.io";

#[derive(Accounts)]
pub struct InitializeOrganizationV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = ["program_approval".as_bytes(), dao.key().as_ref(), crate::id().as_ref()],
    seeds::program = helium_entity_manager_program.key(),
    bump = program_approval.bump_seed,
  )]
  pub program_approval: Box<Account<'info, ProgramApprovalV0>>,
  #[account(
    mut,
    has_one = collection,
    has_one = sub_dao,
    has_one = dc_mint,
  )]
  pub routing_manager: Box<Account<'info, IotRoutingManagerV0>>,
  #[account(
    has_one = routing_manager,
  )]
  pub net_id: Box<Account<'info, NetIdV0>>,
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref(),
    ],
    seeds::program = data_credits_program.key(),
    bump = data_credits.data_credits_bump,
    has_one = dc_mint
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::mint = dc_mint,
    associated_token::authority = payer,
  )]
  pub payer_dc_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: The new authority for this OUI
  pub authority: AccountInfo<'info>,
  #[account(
    init,
    payer = payer,
    seeds = ["organization".as_bytes(), routing_manager.key().as_ref(), &routing_manager.next_oui_id.to_le_bytes()[..]],
    space = 8 + std::mem::size_of::<OrganizationV0>() + 8 + 60,
    bump
  )]
  pub organization: Box<Account<'info, OrganizationV0>>,
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_metadata: UncheckedAccount<'info>,
  /// CHECK: Handled By cpi account
  #[account(
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_master_edition: UncheckedAccount<'info>,
  /// CHECK: Checked in cpi
  #[account(
    seeds = [b"entity_creator", dao.key().as_ref()],
    seeds::program = helium_entity_manager_program.key(),
    bump,
  )]
  pub entity_creator: UncheckedAccount<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    mut,
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hash(format!("OUI_{}", &routing_manager.next_oui_id).as_bytes()).to_bytes()
    ],
    seeds::program = helium_entity_manager_program.key(),
    bump
  )]
  /// CHECK: Checked in cpi
  pub key_to_asset: UncheckedAccount<'info>,
  #[account(
      mut,
      seeds = [merkle_tree.key().as_ref()],
      seeds::program = bubblegum_program.key(),
      bump,
  )]
  pub tree_authority: Box<Account<'info, TreeConfig>>,
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
  #[account(
    mut,
    seeds = ["shared_merkle".as_bytes(), &[3]],
    seeds::program = helium_entity_manager_program.key(),
    bump = shared_merkle.bump_seed,
    has_one = merkle_tree
  )]
  pub shared_merkle: Box<Account<'info, SharedMerkleV0>>,

  /// CHECK: Verified by constraint
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
  pub helium_entity_manager_program: Program<'info, HeliumEntityManager>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub data_credits_program: Program<'info, DataCredits>,
}

pub fn handler(ctx: Context<InitializeOrganizationV0>) -> Result<()> {
  let seeds: &[&[&[u8]]] = &[
    routing_manager_seeds!(ctx.accounts.routing_manager),
    net_id_seeds!(ctx.accounts.net_id),
  ];
  let key = format!("OUI_{}", ctx.accounts.routing_manager.next_oui_id);
  let escrow_key = key.clone();

  ctx.accounts.organization.set_inner(OrganizationV0 {
    oui: ctx.accounts.routing_manager.next_oui_id,
    routing_manager: ctx.accounts.routing_manager.key(),
    authority: ctx.accounts.authority.key(),
    escrow_key,
    bump_seed: ctx.bumps["organization"],
    net_id: ctx.accounts.net_id.key(),
    approved: false,
  });

  let uri = format!(
    "{}/v2/oui/{}",
    ENTITY_METADATA_URL,
    ctx.accounts.key_to_asset.key(),
  );

  issue_program_entity_v0(
    CpiContext::new_with_signer(
      ctx.accounts.helium_entity_manager_program.to_account_info(),
      IssueProgramEntityV0 {
        payer: ctx.accounts.payer.to_account_info(),
        program_approver: ctx.accounts.net_id.to_account_info(),
        program_approval: ctx.accounts.program_approval.to_account_info(),
        collection_authority: ctx.accounts.routing_manager.to_account_info(),
        collection: ctx.accounts.collection.to_account_info(),
        collection_metadata: ctx.accounts.collection_metadata.to_account_info(),
        collection_master_edition: ctx.accounts.collection_master_edition.to_account_info(),
        entity_creator: ctx.accounts.entity_creator.to_account_info(),
        dao: ctx.accounts.dao.to_account_info(),
        key_to_asset: ctx.accounts.key_to_asset.to_account_info(),
        tree_authority: ctx.accounts.tree_authority.to_account_info(),
        recipient: ctx.accounts.recipient.to_account_info(),
        merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
        bubblegum_signer: ctx.accounts.bubblegum_signer.to_account_info(),
        token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
        bubblegum_program: ctx.accounts.bubblegum_program.to_account_info(),
        compression_program: ctx.accounts.compression_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        shared_merkle: Some(ctx.accounts.shared_merkle.to_account_info()),
      },
      seeds,
    ),
    IssueProgramEntityArgsV0 {
      entity_key: key.as_bytes().to_vec(),
      name: key,
      symbol: String::from("OUI"),
      approver_seeds: seeds[1].iter().map(|s| s.to_vec()).collect(),
      key_serialization: KeySerialization::UTF8,
      metadata_url: Some(uri),
    },
  )?;

  let dc_fee: u64 = ctx
    .accounts
    .routing_manager
    .oui_fee_usd
    .checked_mul(100_000)
    .ok_or(ErrorCode::ArithmeticError)?;

  burn_without_tracking_v0(
    CpiContext::new(
      ctx.accounts.data_credits_program.to_account_info(),
      BurnWithoutTrackingV0 {
        burn_accounts: BurnCommonV0 {
          data_credits: ctx.accounts.data_credits.to_account_info(),
          owner: ctx.accounts.payer.to_account_info(),
          dc_mint: ctx.accounts.dc_mint.to_account_info(),
          burner: ctx.accounts.payer_dc_account.to_account_info(),
          associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
      },
    ),
    BurnWithoutTrackingArgsV0 { amount: dc_fee },
  )?;

  ctx.accounts.routing_manager.next_oui_id += 1;
  Ok(())
}
