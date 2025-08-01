use account_compression_cpi::{account_compression::program::SplAccountCompression, Noop};
use anchor_lang::{
  prelude::*,
  solana_program::{instruction::Instruction, program::invoke},
  system_program::{transfer, Transfer},
};
use bubblegum_cpi::{bubblegum::program::Bubblegum, get_asset_id};
use lazy_distributor::{
  cpi::{accounts::UpdateCompressionDestinationV0, update_compression_destination_v0},
  program::LazyDistributor,
  LazyDistributorV0, RecipientV0, UpdateCompressionDestinationArgsV0,
};
use mini_fanout::{InitializeMiniFanoutArgsV0, MiniFanoutShareArgV0, MiniFanoutV0};
use shared_utils::{resize_to_fit, ORACLE_SIGNER, ORACLE_URL};
use tuktuk_program::TransactionSourceV0;

use crate::{error::ErrorCode, welcome_pack_seeds, UserWelcomePacksV0, WelcomePackV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeWelcomePackArgsV0 {
  pub sol_amount: u64,
  pub rewards_split: Vec<MiniFanoutShareArgV0>,
  pub rewards_schedule: String,
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: InitializeWelcomePackArgsV0)]
pub struct InitializeWelcomePackV0<'info> {
  pub owner: Signer<'info>,
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Rent refund
  pub rent_refund: AccountInfo<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor,
    constraint = recipient.asset == get_asset_id(&merkle_tree.key(), args.index as u64) @ ErrorCode::InvalidAsset
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  /// CHECK: Basically an arg
  pub asset_return_address: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = if user_welcome_packs.data_len() > 0 { user_welcome_packs.data_len() } else { 8 + 60 + std::mem::size_of::<UserWelcomePacksV0>() },
    seeds = [b"user_welcome_packs".as_ref(), owner.key().as_ref()],
    bump,
  )]
  pub user_welcome_packs: Box<Account<'info, UserWelcomePacksV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<WelcomePackV0>(),
    seeds = [b"welcome_pack".as_ref(), owner.key().as_ref(), user_welcome_packs.next_id.to_le_bytes().as_ref()],
    bump,
  )]
  pub welcome_pack: Box<Account<'info, WelcomePackV0>>,
  /// CHECK: Checked by cpi
  #[account(
    seeds = [merkle_tree.key().as_ref()],
    seeds::program = bubblegum_cpi::ID,
    bump,
  )]
  pub tree_authority: AccountInfo<'info>,
  /// CHECK: Checked by cpi
  pub leaf_owner: Signer<'info>,
  /// CHECK: Checked by cpi
  #[account(mut)]
  pub merkle_tree: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub lazy_distributor_program: Program<'info, LazyDistributor>,
}

pub const ATA_SIZE: usize = 165;

// 0.01 SOL.
pub const FANOUT_FUNDING_AMOUNT: u64 = 10000000;

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, InitializeWelcomePackV0<'info>>,
  args: InitializeWelcomePackArgsV0,
) -> Result<()> {
  let asset = get_asset_id(&ctx.accounts.merkle_tree.key(), args.index as u64);
  // First, set the custom destination to the owner so claims don't go to the welcome pack
  let remaining_accounts = ctx.remaining_accounts.to_vec();
  update_compression_destination_v0(
    CpiContext::new(
      ctx.accounts.lazy_distributor_program.to_account_info(),
      UpdateCompressionDestinationV0 {
        owner: ctx.accounts.owner.to_account_info().clone(),
        destination: ctx.accounts.owner.to_account_info(),
        merkle_tree: ctx.accounts.merkle_tree.clone(),
        compression_program: ctx.accounts.compression_program.to_account_info(),
        recipient: ctx.accounts.recipient.to_account_info(),
      },
    )
    .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
    UpdateCompressionDestinationArgsV0 {
      data_hash: args.data_hash,
      creator_hash: args.creator_hash,
      root: args.root,
      index: args.index,
    },
  )?;
  let transfer_accounts = bubblegum_cpi::bubblegum::cpi::accounts::Transfer {
    tree_authority: ctx.accounts.tree_authority.clone(),
    leaf_owner: ctx.accounts.leaf_owner.to_account_info(),
    leaf_delegate: ctx.accounts.leaf_owner.to_account_info(),
    new_leaf_owner: ctx.accounts.welcome_pack.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.clone(),
    log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
    compression_program: ctx.accounts.compression_program.to_account_info(),
    system_program: ctx.accounts.system_program.to_account_info(),
  };
  let mut account_metas = transfer_accounts.to_account_metas(None);
  account_metas.extend(remaining_accounts.iter().map(|acc| AccountMeta {
    pubkey: acc.key(),
    is_signer: false,
    is_writable: false,
  }));
  account_metas[1].is_signer = true;

  // Serialize instruction data: discriminator + args
  let mut data = vec![163, 52, 200, 231, 140, 3, 69, 186];
  data.extend_from_slice(&args.root);
  data.extend_from_slice(&args.data_hash);
  data.extend_from_slice(&args.creator_hash);
  data.extend_from_slice(&(args.index as u64).to_le_bytes());
  data.extend_from_slice(&args.index.to_le_bytes());

  invoke(
    &Instruction {
      program_id: ctx.accounts.bubblegum_program.key(),
      accounts: account_metas,
      data,
    },
    &[transfer_accounts.to_account_infos(), remaining_accounts].concat(),
  )?;

  ctx.accounts.welcome_pack.set_inner(WelcomePackV0 {
    rewards_mint: ctx.accounts.lazy_distributor.rewards_mint,
    lazy_distributor: ctx.accounts.lazy_distributor.key(),
    id: ctx.accounts.user_welcome_packs.next_id,
    owner: ctx.accounts.owner.key(),
    asset,
    rent_refund: ctx.accounts.rent_refund.key(),
    sol_amount: args.sol_amount,
    rewards_split: args.rewards_split.clone(),
    rewards_schedule: args.rewards_schedule.clone(),
    asset_return_address: ctx.accounts.asset_return_address.key(),
    bump_seed: ctx.bumps.welcome_pack,
    unique_id: ctx.accounts.user_welcome_packs.next_unique_id,
  });
  ctx
    .accounts
    .user_welcome_packs
    .set_inner(UserWelcomePacksV0 {
      next_id: ctx.accounts.user_welcome_packs.next_id + 1,
      owner: ctx.accounts.owner.key(),
      bump_seed: ctx.bumps.user_welcome_packs,
      next_unique_id: ctx.accounts.user_welcome_packs.next_unique_id + 1,
    });

  let rent = Rent::get()?;
  let mut fanout_cost = 0;
  if args.rewards_split.len() > 1 {
    fanout_cost = rent.minimum_balance(MiniFanoutV0::size(&InitializeMiniFanoutArgsV0 {
      schedule: args.rewards_schedule,
      shares: args.rewards_split,
      seed: asset.to_bytes().to_vec(),
      pre_task: Some(TransactionSourceV0::RemoteV0 {
        url: format!("{}/v1/tuktuk/asset/{}", ORACLE_URL, asset,),
        signer: ORACLE_SIGNER,
      }),
    }))
      + rent.minimum_balance(ATA_SIZE)
      + FANOUT_FUNDING_AMOUNT;
  }

  let needed_transfer_amount = args
    .sol_amount
    .checked_add(fanout_cost)
    .unwrap()
    .saturating_sub(ctx.accounts.welcome_pack.get_lamports());

  if needed_transfer_amount > 0 {
    transfer(
      CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
          from: ctx.accounts.payer.to_account_info(),
          to: ctx.accounts.welcome_pack.to_account_info(),
        },
      ),
      needed_transfer_amount,
    )?;
  }

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.welcome_pack,
  )?;

  Ok(())
}
