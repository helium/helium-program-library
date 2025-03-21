import * as anchor from "@coral-xyz/anchor";
import * as client from "@helium/distributor-oracle";
import {
  init as initHem,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import {
  EPOCH_LENGTH,
  currentEpoch,
  daoEpochInfoKey,
  daoKey,
  init as initDao,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
  recipientKey,
} from "@helium/lazy-distributor-sdk";
import { init as initBurn } from "@helium/no-emit-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import {
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  createMintInstructions,
  sendAndConfirmWithRetry,
  sendInstructions,
  sendInstructionsWithPriorityFee,
} from "@helium/spl-utils";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { BN } from "bn.js";
import b58 from "bs58";
import os from "os";
import yargs from "yargs/yargs";

const IOT_OPERATIONS_FUND = "iot_operations_fund";
const NOT_EMITTED = "not_emitted";
const MAX_CLAIM_AMOUNT = new BN("207020547945205");

async function getSolanaUnixTimestamp(connection: Connection): Promise<bigint> {
  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(args: any = process.argv) {
  try {
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
      basePriorityFee: {
        type: "number",
        describe: "Base priority fee to be used",
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

    const errors: string[] = [];
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const heliumSubDaosProgram = await initDao(provider);
    const hntMint = new PublicKey(HNT_MINT);
    const unixNow = new Date().valueOf() / 1000;
    const [dao] = daoKey(hntMint);
    const basePriorityFee = Number(argv.basePriorityFee || 1);

    const subDaos = await heliumSubDaosProgram.account.subDaoV0.all([
      {
        memcmp: {
          offset: 8,
          bytes: b58.encode(dao.toBuffer()),
        },
      },
    ]);

    let targetTs = argv.from
      ? new BN(argv.from)
      : subDaos.reduce(
          (acc, subDao) => BN.min(acc, subDao.account.vehntLastCalculatedTs),
          // Start one day back to ensure we at least close the epoch that the job is running in.
          new BN(unixNow - 24 * 60 * 60)
        );

    const solanaTime = await getSolanaUnixTimestamp(provider.connection);

    mainLoop: while (targetTs.toNumber() < unixNow) {
      const epoch = currentEpoch(targetTs);
      console.log(epoch.toNumber(), targetTs.toNumber());
      const driftFromSolana = targetTs.toNumber() - Number(solanaTime);
      // If Solana is within 5 minutes of the epoch we're trying to end, wait.
      // This can happen because of solana clock drift.
      if (driftFromSolana > 0 && driftFromSolana < 60 * 5) {
        await sleep(driftFromSolana * 1000);
      }
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
              await sendInstructionsWithPriorityFee(
                provider,
                [
                  await heliumSubDaosProgram.methods
                    .calculateUtilityScoreV0({ epoch })
                    .accountsPartial({ subDao: subDao.publicKey })
                    .instruction(),
                ],
                {
                  computeUnitLimit: 1000000,
                  basePriorityFee: basePriorityFee,
                }
              );
            } catch (err: any) {
              const strErr = JSON.stringify(err);

              if (
                strErr.includes("Error Code: EpochNotOver") ||
                strErr.includes(`{"Custom":6003}`)
              ) {
                // epoch not over
                break mainLoop;
              }

              if (
                !strErr.includes("Error Code: UtilityScoreAlreadyCalculated") ||
                !strErr.includes(`{"Custom":6002}`)
              )
                errors.push(
                  `Failed to calculate utility score for ${subDao.account.dntMint.toBase58()}: ${err}`
                );
            }
          }
        }
      }

      for (const subDao of subDaos) {
        if (!daoEpochInfo?.doneIssuingRewards) {
          const [subDaoEpoch] = subDaoEpochInfoKey(subDao.publicKey, targetTs);
          const subDaoEpochInfo =
            await heliumSubDaosProgram.account.subDaoEpochInfoV0.fetchNullable(
              subDaoEpoch
            );

          if (!subDaoEpochInfo?.rewardsIssuedAt) {
            try {
              await sendInstructionsWithPriorityFee(
                provider,
                [
                  await heliumSubDaosProgram.methods
                    .issueRewardsV0({ epoch })
                    .accountsPartial({ subDao: subDao.publicKey })
                    .instruction(),
                ],
                {
                  basePriorityFee: basePriorityFee,
                }
              );
            } catch (err: any) {
              errors.push(
                `Failed to issue rewards for ${subDao.account.dntMint.toBase58()}: ${err}`
              );
            }
          }
        }
      }

      targetTs = targetTs.add(new BN(EPOCH_LENGTH));
    }

    // distribute iot operations fund
    const hemProgram = await initHem(provider);
    const lazyProgram = await initLazy(provider);
    const rewardsOracleProgram = await initRewards(provider);
    for (const token of [IOT_MINT, HNT_MINT]) {
      const [lazyDistributor] = lazyDistributorKey(token);
      const [keyToAsset] = keyToAssetKey(dao, IOT_OPERATIONS_FUND, "utf8");
      const assetId = (await hemProgram.account.keyToAssetV0.fetch(keyToAsset))
        .asset;

      const [recipient] = recipientKey(lazyDistributor, assetId);
      if (!(await provider.connection.getAccountInfo(recipient))) {
        const method = lazyProgram.methods.initializeRecipientV0().accountsPartial({
          lazyDistributor,
          mint: assetId,
        });

        await sendInstructionsWithPriorityFee(
          provider,
          [await method.instruction()],
          { basePriorityFee }
        );
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
        "utf8"
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
          Buffer.from(signed.serialize()),
          { skipPreflight: true },
          "confirmed"
        );
      } catch (err: any) {
        errors.push(`Failed to distribute iot op funds: ${err}`);
      }
    }

    // Only do this if that feature has been deployed
    if (hemProgram.methods.issueNotEmittedEntityV0) {
      console.log("Issuing no_emit");
      const noEmitProgram = await initBurn(provider);
      const tokens = [MOBILE_MINT, IOT_MINT, HNT_MINT];
      for (const token of tokens) {
        const [lazyDistributor] = lazyDistributorKey(token);
        const notEmittedEntityKta = keyToAssetKey(dao, NOT_EMITTED, "utf-8")[0];
        // Issue the burn entity if it doesn't exist yet.
        if (!(await provider.connection.getAccountInfo(notEmittedEntityKta))) {
          const mint = Keypair.generate();
          await sendInstructions(
            provider,
            [
              ...(await createMintInstructions(
                provider,
                0,
                provider.wallet.publicKey,
                provider.wallet.publicKey,
                mint
              )),
              await hemProgram.methods
                .issueNotEmittedEntityV0()
                .accountsPartial({
                  dao,
                  mint: mint.publicKey,
                })
                .instruction(),
            ],
            [mint]
          );
        }
        const assetId = (
          await hemProgram.account.keyToAssetV0.fetch(notEmittedEntityKta)
        ).asset;
        const [recipient] = recipientKey(lazyDistributor, assetId);

        try {
          if (!(await provider.connection.getAccountInfo(recipient))) {
            const method = lazyProgram.methods
              .initializeRecipientV0()
              .accountsPartial({
                lazyDistributor,
                mint: assetId,
              });
            await sendInstructionsWithPriorityFee(
              provider,
              [await method.instruction()],
              { basePriorityFee }
            );
          }

          const rewards = await client.getCurrentRewards(
            lazyProgram,
            lazyDistributor,
            assetId
          );

          const tx = await client.formTransaction({
            program: lazyProgram,
            rewardsOracleProgram: rewardsOracleProgram,
            provider,
            rewards,
            asset: assetId,
            lazyDistributor,
          });

          const signed = await provider.wallet.signTransaction(tx);
          await sendAndConfirmWithRetry(
            provider.connection,
            Buffer.from(signed.serialize()),
            { skipPreflight: true },
            "confirmed"
          );
        } catch (err: any) {
          errors.push(
            `Failed to distribute burn funds for mint ${token.toBase58()}: ${err}`
          );
        }
      }

      try {
        console.log("No emit");
        await sendInstructions(provider, [
          await noEmitProgram.methods
            .noEmitV0()
            .accountsPartial({
              mint: hntMint,
            })
            .instruction(),
        ]);
      } catch (err: any) {
        errors.push(`Failed to run noEmitV0`);
      }
    }

    if (!errors.length) process.exit(0);
    errors.map(console.log);
    process.exit(1);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}
