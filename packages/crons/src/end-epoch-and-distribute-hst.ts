import * as anchor from '@coral-xyz/anchor';
import { fanoutKey, init as initHydra } from '@helium/fanout-sdk';
import {
  EPOCH_LENGTH,
  currentEpoch,
  daoEpochInfoKey,
  daoKey,
  init as initDao,
  subDaoEpochInfoKey,
} from '@helium/helium-sub-daos-sdk';
import { HNT_MINT, chunks } from '@helium/spl-utils';
import { getAccount } from '@solana/spl-token';
import { ComputeBudgetProgram as CBP, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import os from 'os';
import yargs from 'yargs/yargs';

const FANOUT_NAME = 'HST';
(async (args: any = process.argv) => {
  const yarg = yargs(args).options({
    wallet: {
      alias: 'k',
      describe: 'Anchor wallet keypair',
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: 'u',
      default: 'http://127.0.0.1:8899',
      describe: 'The solana url',
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const heliumSubDaosProgram = await initDao(provider);
  const hntMint = HNT_MINT;
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
      await heliumSubDaosProgram.account.daoEpochInfoV0.fetchNullable(daoEpoch);

    if (!daoEpochInfo?.doneCalculatingScores) {
      for (const subDao of subDaos) {
        const [subDaoEpoch] = subDaoEpochInfoKey(subDao.publicKey, targetTs);
        const subDaoEpochInfo =
          await heliumSubDaosProgram.account.subDaoEpochInfoV0.fetchNullable(
            subDaoEpoch
          );

        if (!subDaoEpochInfo?.doneCalculatingScores) {
          try {
            await heliumSubDaosProgram.methods
              .calculateUtilityScoreV0({ epoch })
              .accounts({ subDao: subDao.publicKey })
              .preInstructions([CBP.setComputeUnitLimit({ units: 350000 })])
              .rpc({ skipPreflight: true });
          } catch (err: any) {
            console.log(
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

        if (!subDaoEpochInfo?.doneIssuingRewards) {
          try {
            await heliumSubDaosProgram.methods
              .issueRewardsV0({ epoch })
              .accounts({ subDao: subDao.publicKey })
              .rpc({ skipPreflight: true });
          } catch (err: any) {
            console.log(
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
        console.log(`Failed to issue hst pool: ${err.message}`);
      }
    }

    targetTs = targetTs.add(new BN(EPOCH_LENGTH));
  }

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

          console.log('Distributing for mint', mint.toBase58());

          await hydraProgram.methods
            .distributeV0()
            .accounts({
              payer: provider.wallet.publicKey,
              fanout: fanoutK,
              owner,
              mint,
            })
            .rpc({ skipPreflight: true });
        })
      );
    })
  );
})();
