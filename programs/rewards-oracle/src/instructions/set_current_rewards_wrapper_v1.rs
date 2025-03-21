use anchor_lang::prelude::*;
use helium_entity_manager::state::*;
use lazy_distributor::{
  cpi::{accounts::SetCurrentRewardsV0, set_current_rewards_v0},
  program::LazyDistributor,
  state::*,
  SetCurrentRewardsArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetCurrentRewardsWrapperArgsV1 {
  pub oracle_index: u16,
  pub current_rewards: u64,
}

#[derive(Accounts)]
#[instruction(args: SetCurrentRewardsWrapperArgsV1)]
pub struct SetCurrentRewardsWrapperV1<'info> {
  // the oracle EOA that gets wrapped
  #[account(mut)]
  pub oracle: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,

  // We assume that the oracle verified that the key to asset entity key went with these rewards.
  // This endpoint then verifies the connection of that key_to_asset to the recipient asset.
  #[account(
    constraint = key_to_asset.asset == recipient.asset,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,

  /// CHECK: checked in cpi
  #[account(
    seeds = ["oracle_signer".as_bytes()],
    bump
  )]
  pub oracle_signer: AccountInfo<'info>,
  pub lazy_distributor_program: Program<'info, LazyDistributor>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<SetCurrentRewardsWrapperV1>,
  args: SetCurrentRewardsWrapperArgsV1,
) -> Result<()> {
  let mut approver = ctx.accounts.oracle_signer.to_account_info().clone();
  approver.is_signer = true;
  let cpi_accounts = SetCurrentRewardsV0 {
    payer: ctx.accounts.oracle.to_account_info(),
    lazy_distributor: ctx.accounts.lazy_distributor.to_account_info(),
    recipient: ctx.accounts.recipient.to_account_info(),
    oracle: ctx.accounts.oracle.to_account_info(),
    system_program: ctx.accounts.system_program.to_account_info(),
  };

  let signer_seeds: &[&[&[u8]]] = &[&["oracle_signer".as_bytes(), &[ctx.bumps.oracle_signer]]];
  set_current_rewards_v0(
    CpiContext::new_with_signer(
      ctx.accounts.lazy_distributor_program.to_account_info(),
      cpi_accounts,
      signer_seeds,
    )
    .with_remaining_accounts(vec![approver]),
    SetCurrentRewardsArgsV0 {
      oracle_index: args.oracle_index,
      current_rewards: args.current_rewards,
    },
  )?;
  Ok(())
}
