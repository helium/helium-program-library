use account_compression_cpi::{account_compression::program::SplAccountCompression, Noop};
use anchor_lang::{
  prelude::*,
  solana_program::{instruction::Instruction, program::invoke_signed},
};
use bubblegum_cpi::bubblegum::program::Bubblegum;

use crate::{error::ErrorCode, welcome_pack_seeds, UserWelcomePacksV0, WelcomePackV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CloseWelcomePackArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
}

#[derive(Accounts)]
pub struct CloseWelcomePackV0<'info> {
  pub owner: Signer<'info>,
  #[account(
    mut,
    has_one = owner,
    close = rent_refund,
  )]
  pub welcome_pack: Account<'info, WelcomePackV0>,
  #[account(
    has_one = owner,
  )]
  pub user_welcome_packs: Account<'info, UserWelcomePacksV0>,
  /// CHECK: Rent refund
  #[account(
    mut,
    constraint = (welcome_pack.rent_refund == Pubkey::default() && rent_refund.key() == owner.key()) || rent_refund.key() == welcome_pack.rent_refund @ ErrorCode::InvalidRentRefund
  )]
  pub rent_refund: AccountInfo<'info>,
  /// CHECK: Checked by cpi
  #[account(mut)]
  pub merkle_tree: AccountInfo<'info>,
  /// CHECK: Checked by cpi
  #[account(
    seeds = [merkle_tree.key().as_ref()],
    seeds::program = bubblegum_cpi::ID,
    bump,
  )]
  pub tree_authority: AccountInfo<'info>,
  /// CHECK: Checked by cpi
  pub log_wrapper: Program<'info, Noop>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, CloseWelcomePackV0<'info>>,
  args: CloseWelcomePackArgsV0,
) -> Result<()> {
  if ctx.accounts.welcome_pack.id == ctx.accounts.user_welcome_packs.next_id {
    ctx.accounts.user_welcome_packs.next_id =
      ctx.accounts.user_welcome_packs.next_id.saturating_sub(1);
  }

  let welcome_pack = &mut ctx.accounts.welcome_pack;

  let remaining_accounts = ctx.remaining_accounts.to_vec();
  let transfer_accounts = bubblegum_cpi::bubblegum::cpi::accounts::Transfer {
    tree_authority: ctx.accounts.tree_authority.clone(),
    leaf_owner: welcome_pack.to_account_info(),
    leaf_delegate: welcome_pack.to_account_info(),
    new_leaf_owner: ctx.accounts.owner.to_account_info(),
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

  Ok(())
}
