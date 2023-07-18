use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use helium_sub_daos::DaoV0;
use mpl_token_metadata::state::{Creator, DataV2};
use shared_utils::token_metadata::{update_metadata_accounts_v2, UpdateMetadataAccountsV2};

pub const IOT_OPERATIONS_FUND: &str = "iot_operations_fund";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempUpdateIotOperationsFundMetadataArgs {
  pub metadata_url: String,
}

#[derive(Accounts)]
pub struct TempUpdateIotOperationsFundMetadata<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    has_one = authority
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  /// CHECK: Signs as a verified creator to make searching easier
  #[account(
    seeds = [b"entity_creator", dao.key().as_ref()],
    bump,
  )]
  pub entity_creator: UncheckedAccount<'info>,
  pub mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), mint.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  /// CHECK: Checked by cpi
  pub metadata: UncheckedAccount<'info>,

  /// CHECK: Verified by constraint
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
}

pub fn handler(
  ctx: Context<TempUpdateIotOperationsFundMetadata>,
  args: TempUpdateIotOperationsFundMetadataArgs,
) -> Result<()> {
  let entity_creator_seeds: &[&[u8]] = &[
    b"entity_creator",
    ctx.accounts.dao.to_account_info().key.as_ref(),
    &[ctx.bumps["entity_creator"]],
  ];
  let signer_seeds: &[&[&[u8]]] = &[entity_creator_seeds];

  update_metadata_accounts_v2(
    CpiContext::new_with_signer(
      ctx
        .accounts
        .token_metadata_program
        .to_account_info()
        .clone(),
      UpdateMetadataAccountsV2 {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        update_authority: ctx.accounts.entity_creator.to_account_info().clone(),
      },
      signer_seeds,
    ),
    Some(DataV2 {
      name: String::from("IOT Operations Fund"),
      symbol: String::from("IOT OPS"),
      uri: args.metadata_url,
      seller_fee_basis_points: 0,
      creators: Some(vec![Creator {
        address: ctx.accounts.entity_creator.key(),
        verified: true,
        share: 100,
      }]),
      uses: None,
      collection: None,
    }),
    ctx.accounts.entity_creator.key(),
    true,
    true,
  )?;

  Ok(())
}
