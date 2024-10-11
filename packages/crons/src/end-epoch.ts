import * as anchor from "@coral-xyz/anchor";
import * as client from "@helium/distributor-oracle";
import { fanoutKey, init as initHydra } from "@helium/fanout-sdk";
import { init as initBurn } from "@helium/no-emit-sdk";
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
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import {
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  batchParallelInstructionsWithPriorityFee,
  chunks,
  createMintInstructions,
  sendAndConfirmWithRetry,
  sendInstructions,
  sendInstructionsWithPriorityFee,
  truthy,
} from "@helium/spl-utils";
import { getAccount } from "@solana/spl-token";
import { init as initPVR, vsrEpochInfoKey } from "@helium/position-voting-rewards-sdk";
import { ComputeBudgetProgram as CBP, Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";

const FANOUT_NAME = "HST";
const IOT_OPERATIONS_FUND = "iot_operations_fund";
const NOT_EMITTED = "not_emitted";
const MAX_CLAIM_AMOUNT = new BN("207020547945205");

const BASE_PRIORITY_FEE = Number(process.env.BASE_PRIORITY_FEE || "1")

async function getSolanaUnixTimestamp(connection: Connection): Promise<bigint> {
  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}

(async () => {
  try {
    if (!process.env.ANCHOR_WALLET)
      throw new Error("ANCHOR_WALLET not provided");

    if (!process.env.SOLANA_URL) throw new Error("SOLANA_URL not provided");

    process.env.ANCHOR_PROVIDER_URL = process.env.SOLANA_URL;
    anchor.setProvider(anchor.AnchorProvider.local(process.env.SOLANA_URL));

    const errors: string[] = [];
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const heliumSubDaosProgram = await initDao(provider);
    const pvrProgram = await initPVR(provider);
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
      // Start one day back to ensure we at least close the epoch that the job is running in.
      new BN(unixNow - 24 * 60 * 60)
    );
    const solanaTime = await getSolanaUnixTimestamp(provider.connection)

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
                    .accounts({ subDao: subDao.publicKey })
                    .instruction(),
                ],
                {
                  computeUnitLimit: 1000000,
                  basePriorityFee: BASE_PRIORITY_FEE,
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

      if (!daoEpochInfo?.doneIssuingRewards) {
        for (const subDao of subDaos) {
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
                    .accounts({ subDao: subDao.publicKey })
                    .instruction(),
                ],
                {
                  basePriorityFee: BASE_PRIORITY_FEE,
                }
              );
            } catch (err: any) {
              errors.push(
                `Failed to issue rewards for ${subDao.account.dntMint.toBase58()}: ${err}`
              );
            }
          }

          const hasVeTokenTracker = !subDao.account.vetokenTracker.equals(PublicKey.default);
          if (hasVeTokenTracker) {
            const [vsrEpoch] = vsrEpochInfoKey(subDao.account.vetokenTracker, targetTs);
            const vsrEpochInfo =
              await pvrProgram.account.vsrEpochInfoV0.fetchNullable(
                vsrEpoch
              );
            if (!vsrEpochInfo || !vsrEpochInfo.rewardsIssuedAt) {
            try {
              await sendInstructionsWithPriorityFee(
                provider,
                [
                  await heliumSubDaosProgram.methods
                    .issueVotingRewardsV0({ epoch })
                    .accounts({
                      subDao: subDao.publicKey,
                      vsrEpochInfo: vsrEpoch,
                    })
                    .instruction(),
                ],
                {
                  basePriorityFee: BASE_PRIORITY_FEE,
                }
              );
            } catch (err: any) {
              errors.push(
                `Failed to issue voting rewards for ${subDao.account.dntMint.toBase58()}: ${err}`
                );
              }
            }
          }
        }
      }

      if (!daoEpochInfo?.doneIssuingHstPool) {
        try {
          await sendInstructionsWithPriorityFee(
            provider,
            [
              await heliumSubDaosProgram.methods
                .issueHstPoolV0({ epoch })
                .accounts({ dao })
                .instruction(),
            ],
            {
              basePriorityFee: BASE_PRIORITY_FEE,
            }
          );
        } catch (err: any) {
          errors.push(`Failed to issue hst pool: ${err}`);
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

    const instructions = (
      await Promise.all(
        members.map(async (member) => {
          const mint = member.account.mint;
          const owners = await provider.connection.getTokenLargestAccounts(
            mint
          );
          const owner = (
            await getAccount(provider.connection, owners.value[0].address)
          ).owner;

          try {
            return await hydraProgram.methods
              .distributeV0()
              .accounts({
                payer: provider.wallet.publicKey,
                fanout: fanoutK,
                owner,
                mint,
              })
              .instruction();
          } catch (err: any) {
            errors.push(
              `Failed to distribute hst for ${mint.toBase58()}: ${err}`
            );
          }
        })
      )
    ).filter(truthy);
    await batchParallelInstructionsWithPriorityFee(provider, instructions, {
      basePriorityFee: BASE_PRIORITY_FEE,
    });

    // distribute iot operations fund
    const hemProgram = await initHem(provider);
    const lazyProgram = await initLazy(provider);
    const rewardsOracleProgram = await initRewards(provider);
    const [lazyDistributor] = lazyDistributorKey(iotMint);
    const [keyToAsset] = keyToAssetKey(dao, IOT_OPERATIONS_FUND, "utf8");
    const assetId = (await hemProgram.account.keyToAssetV0.fetch(keyToAsset))
      .asset;

    const [recipient] = recipientKey(lazyDistributor, assetId);
    if (!(await provider.connection.getAccountInfo(recipient))) {
      const method = lazyProgram.methods.initializeRecipientV0().accounts({
        lazyDistributor,
        mint: assetId,
      });

      await sendInstructionsWithPriorityFee(provider, [await method.instruction()], {
        basePriorityFee: BASE_PRIORITY_FEE
      });
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

    // Only do this if that feature has been deployed
    if (hemProgram.methods.issueNotEmittedEntityV0) {
      console.log("Issuing no_emit");
      const noEmitProgram = await initBurn(provider);
      const tokens = [MOBILE_MINT, IOT_MINT];
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
                .accounts({
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
              .accounts({
                lazyDistributor,
                mint: assetId,
              });
            await sendInstructionsWithPriorityFee(provider, [await method.instruction()], { 
              basePriorityFee: BASE_PRIORITY_FEE
            });
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

          await sendInstructions(provider, [
            await noEmitProgram.methods
              .noEmitV0()
              .accounts({
                mint: token,
              })
              .instruction(),
          ]);
        } catch (err: any) {
          errors.push(
            `Failed to distribute burn funds for mint ${token.toBase58()}: ${err}`
          );
        }
      }
    }

    if (!errors.length) process.exit(0);
    errors.map(console.log);
    process.exit(1);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
})();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

