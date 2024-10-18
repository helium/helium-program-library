import {
  currentEpoch,
  daoEpochInfoKey,
  daoKey,
  EPOCH_LENGTH,
  init as initDao,
} from "@helium/helium-sub-daos-sdk";
import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import b58 from "bs58";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  init as initPVR,
  vsrEpochInfoKey,
} from "@helium/position-voting-rewards-sdk";

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    hntMint: {
      type: "string",
      describe: "Mint of the HNT token",
    },
    from: {
      type: "number",
      describe: "The timestamp to start ending epochs from",
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const heliumSubDaosProgram = await initDao(provider);
  const pvrProgram = await initPVR(provider);
  const hntMint = new PublicKey(argv.hntMint!);
  const dao = await daoKey(hntMint)[0];
  const subdaos = await heliumSubDaosProgram.account.subDaoV0.all([
    {
      memcmp: {
        offset: 8,
        bytes: b58.encode(dao.toBuffer()),
      },
    },
  ]);
  let targetTs = argv.from
    ? new BN(argv.from)
    : subdaos[0].account.vehntLastCalculatedTs;

  while (targetTs.toNumber() < new Date().valueOf() / 1000) {
    const epoch = currentEpoch(targetTs);
    console.log(epoch.toNumber(), targetTs.toNumber());
    const daoEpochInfo =
      await heliumSubDaosProgram.account.daoEpochInfoV0.fetchNullable(
        daoEpochInfoKey(dao, targetTs)[0]
      );
    if (!daoEpochInfo?.doneCalculatingScores) {
      for (const subDao of subdaos) {
        try {
          await sendInstructionsWithPriorityFee(
            provider,
            [
              await heliumSubDaosProgram.methods
                .calculateUtilityScoreV0({ epoch })
                .accounts({ subDao: subDao.publicKey })
                .instruction(),
            ],
            {
              computeUnitLimit: 1000000,
            }
          );
        } catch (e: any) {
          console.log(
            `Failed to calculate utility score for ${subDao.account.dntMint.toBase58()}: ${
              e.message
            }`
          );
        }
      }
    }
    if (!daoEpochInfo?.doneIssuingRewards) {
      for (const subDao of subdaos) {
        try {
          await sendInstructionsWithPriorityFee(provider, [
            await heliumSubDaosProgram.methods
              .issueRewardsV0({ epoch })
              .accounts({ subDao: subDao.publicKey })
              .instruction(),
          ]);
        } catch (e: any) {
          console.log(
            `Failed to issue rewards for ${subDao.account.dntMint.toBase58()}: ${
              e.message
            }`
          );
        }

        const hasVeTokenTracker = !subDao.account.vetokenTracker.equals(
          PublicKey.default
        );
        if (hasVeTokenTracker) {
          const [vsrEpoch] = vsrEpochInfoKey(
            subDao.account.vetokenTracker,
            targetTs
          );
          const vsrEpochInfo =
            await pvrProgram.account.vsrEpochInfoV0.fetchNullable(vsrEpoch);
          if (!vsrEpochInfo || !vsrEpochInfo.rewardsIssuedAt) {
            try {
              await sendInstructionsWithPriorityFee(provider, [
                await heliumSubDaosProgram.methods
                  .issueVotingRewardsV0({ epoch })
                  .accounts({ subDao: subDao.publicKey, vsrEpochInfo: vsrEpoch })
                  .instruction(),
              ]);
            } catch (err: any) {
              console.log(
                `Failed to issue voting rewards for ${subDao.account.dntMint.toBase58()}: ${err}`
              );
            }
          }
        }
      }
    }

    try {
      if (!daoEpochInfo?.doneIssuingHstPool) {
        await sendInstructionsWithPriorityFee(provider, [
          await heliumSubDaosProgram.methods
            .issueHstPoolV0({ epoch })
            .accounts({ dao })
            .instruction(),
        ]);
      }
    } catch (e: any) {
      console.log(`Failed to issue hst pool: ${e.message}`);
    }

    targetTs = targetTs.add(new BN(EPOCH_LENGTH));
  }
}
