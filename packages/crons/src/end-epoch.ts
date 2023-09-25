import * as anchor from '@coral-xyz/anchor';
import * as client from '@helium/distributor-oracle';
import { fanoutKey, init as initHydra } from '@helium/fanout-sdk';
import {
  init as initHem,
  keyToAssetKey,
} from '@helium/helium-entity-manager-sdk';
import {
  EPOCH_LENGTH,
  currentEpoch,
  daoEpochInfoKey,
  daoKey,
  init as initDao,
  subDaoEpochInfoKey,
} from '@helium/helium-sub-daos-sdk';
import {
  init as initLazy,
  lazyDistributorKey,
  recipientKey,
} from '@helium/lazy-distributor-sdk';
import { init as initRewards } from '@helium/rewards-oracle-sdk';
import {
  HNT_MINT,
  IOT_MINT,
  chunks,
  sendAndConfirmWithRetry,
} from '@helium/spl-utils';
import { getAccount } from '@solana/spl-token';
import { ComputeBudgetProgram as CBP } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';

const FANOUT_NAME = 'HST';
const IOT_OPERATIONS_FUND = 'iot_operations_fund';
const MAX_CLAIM_AMOUNT = new BN('207020547945205');

(async () => {
  const errors: string[] = [];

  try {
    if (!process.env.ANCHOR_WALLET)
      throw new Error('ANCHOR_WALLET not provided');

    if (!process.env.SOLANA_URL) throw new Error('SOLANA_URL not provided');

    process.env.ANCHOR_PROVIDER_URL = process.env.SOLANA_URL;
    anchor.setProvider(anchor.AnchorProvider.local(process.env.SOLANA_URL));

    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const heliumSubDaosProgram = await initDao(provider);
    const hntMint = HNT_MINT;
    const iotMint = IOT_MINT;
    const unixNow = new Date().valueOf() / 1000;
    const [dao] = daoKey(hntMint);

    const subDaos = await heliumSubDaosProgram.account.subDaoV0.all([
      {
        memcmp: {
          offset: 8,
          bytes: bs58.encode(dao.toBuffer()),
        },
      },
    ]);

    let targetTs = subDaos.reduce(
      (acc, subDao) => BN.min(acc, subDao.account.vehntLastCalculatedTs),
      new BN(unixNow)
    );

    while (targetTs.toNumber() < unixNow) {
      const epoch = currentEpoch(targetTs);
      console.log(epoch.toNumber(), targetTs.toNumber());
      const [daoEpoch] = daoEpochInfoKey(dao, targetTs);
      const daoEpochInfo =
        await heliumSubDaosProgram.account.daoEpochInfoV0.fetchNullable(
          daoEpoch
        );

      if (!daoEpochInfo?.doneCalculatingScores) {
        for (const subDao of subDaos) {
          const [subDaoEpoch] = subDaoEpochInfoKey(subDao.publicKey, targetTs);
          const subDaoEpochInfo =
            await heliumSubDaosProgram.account.subDaoEpochInfoV0.fetchNullable(
              subDaoEpoch
            );

          if (!subDaoEpochInfo?.utilityScore) {
            try {
              await heliumSubDaosProgram.methods
                .calculateUtilityScoreV0({ epoch })
                .accounts({ subDao: subDao.publicKey })
                .preInstructions([CBP.setComputeUnitLimit({ units: 1000000 })])
                .rpc({ skipPreflight: true });
            } catch (err: any) {
              errors.push(
                `Failed to calculate utility score for ${subDao.account.dntMint.toBase58()}: ${
                  err.message
                }`
              );
            }
          }
        }
      }

      if (!daoEpochInfo?.doneIssuingRewards) {
        for (const subDao of subDaos) {
          const [subDaoEpoch] = subDaoEpochInfoKey(subDao.publicKey, targetTs);
          const subDaoEpochInfo =
            await heliumSubDaosProgram.account.subDaoEpochInfoV0.fetchNullable(
              subDaoEpoch
            );

          if (!subDaoEpochInfo?.rewardsIssuedAt) {
            try {
              await heliumSubDaosProgram.methods
                .issueRewardsV0({ epoch })
                .accounts({ subDao: subDao.publicKey })
                .rpc({ skipPreflight: true });
            } catch (err: any) {
              errors.push(
                `Failed to issue rewards for ${subDao.account.dntMint.toBase58()}: ${
                  err.message
                }`
              );
            }
          }
        }
      }

      if (!daoEpochInfo?.doneIssuingHstPool) {
        try {
          await heliumSubDaosProgram.methods
            .issueHstPoolV0({ epoch })
            .accounts({ dao })
            .rpc({ skipPreflight: true });
        } catch (err: any) {
          errors.push(`Failed to issue hst pool: ${err.message}`);
        }
      }

      targetTs = targetTs.add(new BN(EPOCH_LENGTH));
    }

    // distribute hst
    const hydraProgram = await initHydra(provider);
    const [fanoutK] = fanoutKey(FANOUT_NAME);
    const members = (await hydraProgram.account.fanoutVoucherV0.all()).filter(
      (m) => m.account.fanout.equals(fanoutK)
    );

    await Promise.all(
      chunks(members, 100).map(async (chunk) => {
        await Promise.all(
          chunk.map(async (member) => {
            const mint = member.account.mint;
            const owners = await provider.connection.getTokenLargestAccounts(
              mint
            );
            const owner = (
              await getAccount(provider.connection, owners.value[0].address)
            ).owner;

            try {
              await hydraProgram.methods
                .distributeV0()
                .accounts({
                  payer: provider.wallet.publicKey,
                  fanout: fanoutK,
                  owner,
                  mint,
                })
                .rpc({ skipPreflight: true });
            } catch (err: any) {
              errors.push(`Failed to distribute hst for mint: ${err.message}`);
            }
          })
        );
      })
    );

    // distribute iot operations fund
    const hemProgram = await initHem(provider);
    const lazyProgram = await initLazy(provider);
    const rewardsOracleProgram = await initRewards(provider);
    const [lazyDistributor] = lazyDistributorKey(iotMint);
    const [keyToAsset] = keyToAssetKey(dao, IOT_OPERATIONS_FUND, 'utf8');
    const assetId = (await hemProgram.account.keyToAssetV0.fetch(keyToAsset))
      .asset;

    const [recipient] = recipientKey(lazyDistributor, assetId);
    if (!(await provider.connection.getAccountInfo(recipient))) {
      const method = lazyProgram.methods.initializeRecipientV0().accounts({
        lazyDistributor,
        mint: assetId,
      });

      await method.rpc({ skipPreflight: true });
    }

    const rewards = await client.getCurrentRewards(
      lazyProgram,
      lazyDistributor,
      assetId
    );

    const pending = await client.getPendingRewards(
      lazyProgram,
      lazyDistributor,
      daoKey(HNT_MINT)[0],
      [IOT_OPERATIONS_FUND],
      'utf8'
    );

    // Avoid claiming too much and tripping the breaker
    if (new BN(pending[IOT_OPERATIONS_FUND]).gt(MAX_CLAIM_AMOUNT)) {
      rewards[0].currentRewards = new BN(rewards[0].currentRewards)
        .sub(new BN(pending[IOT_OPERATIONS_FUND]))
        .add(MAX_CLAIM_AMOUNT)
        .toString();
    }

    const tx = await client.formTransaction({
      program: lazyProgram,
      rewardsOracleProgram: rewardsOracleProgram,
      provider,
      rewards,
      asset: assetId,
      lazyDistributor,
    });

    const signed = await provider.wallet.signTransaction(tx);

    try {
      await sendAndConfirmWithRetry(
        provider.connection,
        signed.serialize(),
        { skipPreflight: true },
        'confirmed'
      );
    } catch (err: any) {
      errors.push(`Failed to distribute iot op funds: ${err.message}`);
    }
  } catch (err) {
    console.log(err);
    process.exit(1);
  }

  if (errors.length) {
    errors.map(console.log);
    process.exit(1);
  }
})();
