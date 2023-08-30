import * as anchor from '@coral-xyz/anchor';
import { fanoutKey, init as initHydra } from '@helium/fanout-sdk';
import {
  EPOCH_LENGTH,
  currentEpoch,
  daoEpochInfoKey,
  daoKey,
  init as initDao,
} from '@helium/helium-sub-daos-sdk';
import { HNT_MINT } from '@helium/spl-utils';
import { getAccount } from '@solana/spl-token';
import { ComputeBudgetProgram as CBP, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import os from 'os';
import yargs from 'yargs/yargs';

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
    hntMint: {
      type: 'string',
      default: HNT_MINT.toBase58(),
      describe: 'Mint of the HNT token',
    },
    name: {
      type: 'string',
      describe: 'Name of the fanout',
      required: true,
    },
    mint: {
      type: 'string',
      describe: 'Mint to dist',
      required: true,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const heliumSubDaosProgram = await initDao(provider);
  const hydraProgram = await initHydra(provider);
  const hntMint = new PublicKey(argv.hntMint);
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
    new BN(new Date().valueOf() / 1000)
  );

  while (targetTs.toNumber() < new Date().valueOf() / 1000) {
    const epoch = currentEpoch(new BN(targetTs));
    console.log(epoch.toNumber(), targetTs);
    const [daoEpoch] = daoEpochInfoKey(dao, targetTs);
    const daoEpochInfo =
      await heliumSubDaosProgram.account.daoEpochInfoV0.fetchNullable(daoEpoch);

    for (const subDao of subDaos) {
      if (!daoEpochInfo?.doneCalculatingScores) {
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

      if (!daoEpochInfo?.doneIssuingRewards) {
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

    if (!daoEpochInfo?.doneIssuingHstPool) {
      try {
        if (!daoEpochInfo?.doneIssuingHstPool) {
          await heliumSubDaosProgram.methods
            .issueHstPoolV0({ epoch })
            .accounts({ dao })
            .rpc({ skipPreflight: true });
        }
      } catch (err: any) {
        console.log(`Failed to issue hst pool: ${err.message}`);
      }
    }

    targetTs = targetTs.add(new BN(EPOCH_LENGTH));
  }
})();
