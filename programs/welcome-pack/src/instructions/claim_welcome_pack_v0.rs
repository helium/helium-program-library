use account_compression_cpi::{account_compression::program::SplAccountCompression, Noop};
use anchor_lang::{
  prelude::*,
  solana_program::{instruction::Instruction, program::invoke_signed},
  system_program::{transfer, Transfer},
};
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token},
};
use brine_ed25519::sig_verify;
use bubblegum_cpi::{bubblegum::program::Bubblegum, get_asset_id};
use lazy_distributor::{
  cpi::{accounts::UpdateCompressionDestinationV0, update_compression_destination_v0},
  program::LazyDistributor,
  RecipientV0, UpdateCompressionDestinationArgsV0,
};
use mini_fanout::{
  cpi::{
    accounts::{InitializeMiniFanoutV0, ScheduleTaskV0},
    initialize_mini_fanout_v0, schedule_task_v0,
  },
  program::MiniFanout,
  InitializeMiniFanoutArgsV0, MiniFanoutShareArgV0, MiniFanoutV0, ScheduleTaskArgsV0,
};
use shared_utils::{ORACLE_SIGNER, ORACLE_URL};
use tuktuk_program::{tuktuk::program::Tuktuk, TransactionSourceV0};

use crate::{error::ErrorCode, welcome_pack_seeds, WelcomePackV0, ATA_SIZE, FANOUT_FUNDING_AMOUNT};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimWelcomePackArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
  pub approval_expiration_timestamp: i64,
  pub claim_signature: [u8; 64],
  pub task_id: u16,
  pub pre_task_id: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimApprovalV0 {
  pub welcome_pack: Pubkey,
  pub expiration_timestamp: i64,
}

#[derive(Accounts)]
#[instruction(args: ClaimWelcomePackArgsV0)]
pub struct ClaimWelcomePackV0<'info> {
  #[account(mut)]
  pub claimer: Signer<'info>,
  /// CHECK: Rent refund
  #[account(
    mut,
    // If rent_refund is Pubkey::default, that indicates we want to send the asset to the claimer
    // otherwise send to the rent_refund
    constraint = rent_refund.key() == welcome_pack.rent_refund || (welcome_pack.rent_refund == Pubkey::default() && rent_refund.key() == claimer.key()) @ ErrorCode::InvalidRentRefund
  )]
  pub rent_refund: AccountInfo<'info>,
  /// CHECK: by constraint
  #[account(
    // If asset_return_address is Pubkey::default, that indicates we want to send the asset to the claimer
    // otherwise send to the asset_return_address
    constraint = asset_return_address.key() == welcome_pack.asset_return_address || (welcome_pack.asset_return_address == Pubkey::default() && asset_return_address.key() == claimer.key()) @ ErrorCode::InvalidAssetReturnAddress
  )]
  pub asset_return_address: AccountInfo<'info>,
  /// CHECK: Just needed for setting the ownwer of the mini fanout
  pub owner: AccountInfo<'info>,
  #[account(
    mut,
    has_one = owner,
    has_one = rewards_mint,
    constraint = recipient.lazy_distributor == welcome_pack.lazy_distributor
  )]
  pub welcome_pack: Box<Account<'info, WelcomePackV0>>,
  pub rewards_mint: Account<'info, Mint>,
  #[account(
    mut,
    constraint = recipient.asset == get_asset_id(&merkle_tree.key(), args.index as u64) @ ErrorCode::InvalidAsset
  )]
  pub recipient: Account<'info, RecipientV0>,
  /// CHECK: This should either be the fanout wallet or the address if single recipient.
  #[account(mut)]
  pub rewards_recipient: AccountInfo<'info>,
  /// CHECK: Needed if initializing a fanout
  #[account(mut)]
  pub token_account: AccountInfo<'info>,
  /// CHECK: Just needed for CPI into mini fanout program
  pub queue_authority: AccountInfo<'info>,
  /// CHECK: Just needed for CPI into mini fanout program
  #[account(mut)]
  pub task_queue: AccountInfo<'info>,
  /// CHECK: Just needed for CPI into mini fanout program
  pub task_queue_authority: AccountInfo<'info>,
  /// CHECK: Used in CPI into mini fanout program
  #[account(mut)]
  pub task: AccountInfo<'info>,
  /// CHECK: Used in CPI into mini fanout program
  #[account(mut)]
  pub pre_task: AccountInfo<'info>,
  /// CHECK: Checked by cpi
  pub tree_authority: AccountInfo<'info>,
  /// CHECK: Checked by cpi
  #[account(mut)]
  pub merkle_tree: AccountInfo<'info>,
  pub log_wrapper: Program<'info, Noop>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
  pub mini_fanout_program: Program<'info, MiniFanout>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub lazy_distributor_program: Program<'info, LazyDistributor>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, ClaimWelcomePackV0<'info>>,
  args: ClaimWelcomePackArgsV0,
) -> Result<()> {
  require_gt!(
    args.approval_expiration_timestamp,
    Clock::get()?.unix_timestamp,
    ErrorCode::ClaimApprovalExpired
  );
  let mut claim_approval_bytes = Vec::with_capacity(8 + 32);
  ClaimApprovalV0 {
    welcome_pack: ctx.accounts.welcome_pack.key(),
    expiration_timestamp: args.approval_expiration_timestamp,
  }
  .serialize(&mut claim_approval_bytes)?;
  let msg = format!(
    "Approve invite {} expiring {}",
    ctx.accounts.welcome_pack.unique_id, args.approval_expiration_timestamp
  );
  sig_verify(
    &ctx.accounts.welcome_pack.owner.key().to_bytes(),
    &args.claim_signature,
    msg.as_bytes(),
  )
  .map_err(|e| {
    msg!("Invalid claim approval signature: {:?}", e);
    error!(ErrorCode::InvalidClaimApprovalSignature)
  })?;

  let welcome_pack = &mut ctx.accounts.welcome_pack;
  let asset_id = get_asset_id(&ctx.accounts.merkle_tree.key(), args.index as u64);
  let mapped_shares: Vec<MiniFanoutShareArgV0> = welcome_pack
    .rewards_split
    .iter()
    .map(|f| MiniFanoutShareArgV0 {
      wallet: if f.wallet == Pubkey::default() {
        ctx.accounts.claimer.key()
      } else {
        f.wallet
      },
      share: f.share.clone(),
    })
    .collect();

  let fanout_args = InitializeMiniFanoutArgsV0 {
    seed: asset_id.to_bytes().to_vec(),
    schedule: welcome_pack.rewards_schedule.clone(),
    shares: mapped_shares.clone(),
    pre_task: Some(TransactionSourceV0::RemoteV0 {
      url: format!("{}/v1/tuktuk/asset/{}", ORACLE_URL, asset_id,),
      signer: ORACLE_SIGNER,
    }),
  };
  let rent = Rent::get()?;
  let fanout_cost = rent.minimum_balance(MiniFanoutV0::size(&fanout_args))
    + rent.minimum_balance(ATA_SIZE)
    + FANOUT_FUNDING_AMOUNT;

  // Transfer the sol amount to the claimer
  let needs_fanout = welcome_pack.rewards_split.len() > 1;
  let rent_refunded_amount = welcome_pack
    .get_lamports()
    .saturating_sub(if needs_fanout { fanout_cost } else { 0 })
    .saturating_sub(welcome_pack.sol_amount);
  if rent_refunded_amount > 0 {
    welcome_pack.sub_lamports(rent_refunded_amount)?;
    ctx
      .accounts
      .rent_refund
      .add_lamports(rent_refunded_amount)?;
  }

  let mut ld_destination = mapped_shares[0].wallet;
  if needs_fanout {
    ld_destination = ctx.accounts.rewards_recipient.key();
  }
  require_eq!(
    ctx.accounts.rewards_recipient.key(),
    ld_destination,
    ErrorCode::InvalidRewardsRecipient
  );
  update_compression_destination_v0(
    CpiContext::new_with_signer(
      ctx.accounts.lazy_distributor_program.to_account_info(),
      UpdateCompressionDestinationV0 {
        owner: welcome_pack.to_account_info().clone(),
        destination: ctx.accounts.rewards_recipient.to_account_info(),
        merkle_tree: ctx.accounts.merkle_tree.clone(),
        compression_program: ctx.accounts.compression_program.to_account_info(),
        recipient: ctx.accounts.recipient.to_account_info(),
      },
      &[welcome_pack_seeds!(welcome_pack)],
    )
    .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
    UpdateCompressionDestinationArgsV0 {
      data_hash: args.data_hash,
      creator_hash: args.creator_hash,
      root: args.root,
      index: args.index,
    },
  )?;

  let remaining_accounts = ctx.remaining_accounts.to_vec();
  let transfer_accounts = bubblegum_cpi::bubblegum::cpi::accounts::Transfer {
    tree_authority: ctx.accounts.tree_authority.clone(),
    leaf_owner: welcome_pack.to_account_info(),
    leaf_delegate: welcome_pack.to_account_info(),
    new_leaf_owner: ctx.accounts.asset_return_address.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.clone(),
    log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
    compression_program: ctx.accounts.compression_program.to_account_info(),
    system_program: ctx.accounts.system_program.to_account_info(),
  };
  // Transfer the asset back
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

  invoke_signed(
    &Instruction {
      program_id: ctx.accounts.bubblegum_program.key(),
      accounts: account_metas,
      data,
    },
    &[transfer_accounts.to_account_infos(), remaining_accounts].concat(),
    &[welcome_pack_seeds!(welcome_pack)],
  )?;

  welcome_pack.close(ctx.accounts.claimer.to_account_info())?;

  if needs_fanout {
    // Create a fanout
    initialize_mini_fanout_v0(
      CpiContext::new_with_signer(
        ctx.accounts.mini_fanout_program.to_account_info(),
        InitializeMiniFanoutV0 {
          payer: ctx.accounts.claimer.to_account_info(),
          namespace: welcome_pack.to_account_info().clone(),
          owner: ctx.accounts.owner.to_account_info(),
          mini_fanout: ctx.accounts.rewards_recipient.to_account_info(),
          task_queue: ctx.accounts.task_queue.to_account_info(),
          rent_refund: ctx.accounts.rent_refund.to_account_info(),
          mint: ctx.accounts.rewards_mint.to_account_info(),
          token_account: ctx.accounts.token_account.to_account_info(),
          queue_authority: ctx.accounts.queue_authority.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
          associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
        },
        &[welcome_pack_seeds!(welcome_pack)],
      ),
      fanout_args,
    )?;

    // Schedule the task
    schedule_task_v0(
      CpiContext::new(
        ctx.accounts.mini_fanout_program.to_account_info(),
        ScheduleTaskV0 {
          payer: ctx.accounts.claimer.to_account_info(),
          mini_fanout: ctx.accounts.rewards_recipient.to_account_info(),
          next_task: ctx.accounts.system_program.to_account_info(),
          queue_authority: ctx.accounts.queue_authority.to_account_info(),
          task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
          task_queue: ctx.accounts.task_queue.to_account_info(),
          task: ctx.accounts.task.to_account_info(),
          next_pre_task: ctx.accounts.system_program.to_account_info(),
          pre_task: ctx.accounts.pre_task.to_account_info(),
          tuktuk_program: ctx.accounts.tuktuk_program.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
      ),
      ScheduleTaskArgsV0 {
        task_id: args.task_id,
        pre_task_id: args.pre_task_id,
      },
    )?;

    // Fund the fanout so it can schedule tasks
    transfer(
      CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
          from: ctx.accounts.claimer.to_account_info(),
          to: ctx.accounts.rewards_recipient.to_account_info(),
        },
      ),
      FANOUT_FUNDING_AMOUNT - ctx.accounts.task.lamports(),
    )?;
  }

  Ok(())
}
