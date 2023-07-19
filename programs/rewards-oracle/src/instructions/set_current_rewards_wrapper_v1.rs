use anchor_lang::prelude::*;
use helium_entity_manager::state::*;
use lazy_distributor::program::LazyDistributor;
use lazy_distributor::state::*;
use lazy_distributor::{
  cpi::{accounts::SetCurrentRewardsV0, set_current_rewards_v0},
  SetCurrentRewardsArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetCurrentRewardsWrapperArgsV1 {
  pub oracle_index: u16,
  pub current_rewards: u64,
  /// Txn includes the hashed entity key so the oracle can be sure that,
  /// even if the RPC lied about the entity key in KeyToAsset, the
  /// transaction must match the entity key used in the oracle query.
  pub hashed_entity_key: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: SetCurrentRewardsWrapperArgsV1)]
pub struct SetCurrentRewardsWrapperV1<'info> {
  #[account(mut)]
  // the oracle EOA that gets wrapped
  pub oracle: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,

  #[account(
    constraint = key_to_asset.asset == recipient.asset,
    seeds = [
      "key_to_asset".as_bytes(),
      dao.key().as_ref(),
      &hashed_entity_key[..]
    ],
    bump = key_to_asset.bump_seed,
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
  pub dao: Account<'info, DaoV0>,
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

  let signer_seeds: &[&[&[u8]]] = &[&[
    "oracle_signer".as_bytes(),
    &[*ctx.bumps.get("oracle_signer").unwrap()],
  ]];
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
