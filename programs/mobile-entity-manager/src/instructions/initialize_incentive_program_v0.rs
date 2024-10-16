use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::{prelude::*, solana_program::hash::hash};
use anchor_spl::token::Mint;
use bubblegum_cpi::{program::Bubblegum, TreeConfig};
use helium_entity_manager::{
  cpi::{accounts::IssueProgramEntityV0, issue_program_entity_v0},
  program::HeliumEntityManager,
  IssueProgramEntityArgsV0, KeySerialization, ProgramApprovalV0,
};
use helium_sub_daos::{DaoV0, SubDaoV0};

use crate::{carrier_seeds, error::ErrorCode, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeIncentiveProgramArgsV0 {
  pub name: String,
  pub metadata_url: Option<String>,
  pub start_ts: i64,
  pub stop_ts: i64,
  pub shares: u32,
}

#[derive(Accounts)]
#[instruction(args: InitializeIncentiveProgramArgsV0)]
pub struct InitializeIncentiveProgramV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = ["program_approval".as_bytes(), dao.key().as_ref(), crate::id().as_ref()],
    seeds::program = helium_entity_manager_program.key(),
    bump = program_approval.bump_seed,
  )]
  pub program_approval: Box<Account<'info, ProgramApprovalV0>>,
  #[account(
    has_one = collection,
    has_one = merkle_tree,
    has_one = issuing_authority,
    has_one = sub_dao,
    constraint = carrier.approved @ ErrorCode::CarrierNotApproved
  )]
  pub carrier: Box<Account<'info, CarrierV0>>,
  pub issuing_authority: Signer<'info>,
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
  /// CHECK: Checked via cpi
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
      &hash(args.name.as_bytes()).to_bytes()
    ],
    seeds::program = helium_entity_manager_program.key(),
    bump
  )]
  /// CHECK: Checked in cpi
  pub key_to_asset: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    seeds = ["incentive_escrow_program".as_bytes(), carrier.key().as_ref(), &hash(args.name.as_bytes()).to_bytes()],
    bump,
    space = 60 + IncentiveEscrowProgramV0::INIT_SPACE,
  )]
  pub incentive_escrow_program: Box<Account<'info, IncentiveEscrowProgramV0>>,
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

  /// CHECK: Verified by constraint
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
  pub helium_entity_manager_program: Program<'info, HeliumEntityManager>,
}

pub fn handler(
  ctx: Context<InitializeIncentiveProgramV0>,
  args: InitializeIncentiveProgramArgsV0,
) -> Result<()> {
  let seeds: &[&[&[u8]]] = &[carrier_seeds!(ctx.accounts.carrier)];

  issue_program_entity_v0(
    CpiContext::new_with_signer(
      ctx.accounts.helium_entity_manager_program.to_account_info(),
      IssueProgramEntityV0 {
        payer: ctx.accounts.payer.to_account_info(),
        program_approver: ctx.accounts.carrier.to_account_info(),
        program_approval: ctx.accounts.program_approval.to_account_info(),
        collection_authority: ctx.accounts.carrier.to_account_info(),
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
      },
      seeds,
    ),
    IssueProgramEntityArgsV0 {
      entity_key: args.name.as_bytes().to_vec(),
      name: args.name,
      symbol: String::from("INCENTIVE"),
      approver_seeds: seeds[0].iter().map(|s| s.to_vec()).collect(),
      key_serialization: KeySerialization::UTF8,
      metadata_url: args.metadata_url,
    },
  )?;

  ctx
    .accounts
    .incentive_escrow_program
    .set_inner(IncentiveEscrowProgramV0 {
      start_ts: args.start_ts,
      stop_ts: args.stop_ts,
      shares: args.shares,
      carrier: ctx.accounts.carrier.key(),
      bump_seed: ctx.bumps["incentive_escrow_program"],
    });

  Ok(())
}
