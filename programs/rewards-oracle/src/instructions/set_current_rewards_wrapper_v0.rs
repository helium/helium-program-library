use anchor_lang::prelude::*;
use helium_entity_manager::state::*;
use lazy_distributor::state::*;
use lazy_distributor::{
  cpi::{accounts::SetCurrentRewardsV0, set_current_rewards_v0},
  LazyDistributor, SetCurrentRewardsArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetCurrentRewardsWrapperArgsV0 {
  pub entity_key: Vec<u8>,
  pub oracle_index: u16,
  pub current_rewards: u64,
}

#[derive(Accounts)]
#[instruction(args: SetCurrentRewardsWrapperArgsV0)]
pub struct SetCurrentRewardsWrapperV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,

  #[account(
    constraint = key_to_asset.entity_key == args.entity_key,
    constraint = key_to_asset.asset == recipient.asset,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,

  /// CHECK: checked in cpi
  #[account(
    seeds = ["oracle_signer".as_bytes(), payer.key().as_ref()],
    bump
  )]
  pub oracle_signer: AccountInfo<'info>,
  pub lazy_distributor_program: Program<'info, LazyDistributor>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<SetCurrentRewardsWrapperV0>,
  args: SetCurrentRewardsWrapperArgsV0,
) -> Result<()> {
  let cpi_accounts = SetCurrentRewardsV0 {
    payer: ctx.accounts.payer.to_account_info(),
    lazy_distributor: ctx.accounts.lazy_distributor.to_account_info(),
    recipient: ctx.accounts.recipient.to_account_info(),
    oracle: ctx.accounts.oracle_signer.to_account_info(),
    system_program: ctx.accounts.system_program.to_account_info(),
  };

  let signer_seeds: &[&[&[u8]]] = &[&[
    "oracle_signer".as_bytes(),
    ctx.accounts.payer.to_account_info().key.as_ref(),
    &[*ctx.bumps.get("oracle_signer").unwrap()],
  ]];
  set_current_rewards_v0(
    CpiContext::new_with_signer(
      ctx.accounts.lazy_distributor_program.to_account_info(),
      cpi_accounts,
      signer_seeds,
    ),
    SetCurrentRewardsArgsV0 {
      oracle_index: args.oracle_index,
      current_rewards: args.current_rewards,
    },
  )?;
  Ok(())
}
