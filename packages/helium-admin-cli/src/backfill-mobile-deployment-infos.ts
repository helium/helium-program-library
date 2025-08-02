import * as anchor from "@coral-xyz/anchor";
import {
  MobileDeploymentInfoV0,
  init as initHEM,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import {
  MOBILE_MINT,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  chunks,
  truthy,
} from "@helium/spl-utils";
import deepEqual from "fast-deep-equal";
import { latLngToCell } from "h3-js";
import os from "os";
import { Client } from "pg";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

type WifiInfoRow = {
  hs_pubkey: string;
  antenna: number;
  elevation: number;
  azimuth: number;
  mechanical_down_tilt: number;
  electrical_down_tilt: number;
  lat: string;
  lng: string;
};

type WifiInfo = {
  hs_pubkey: string;
  location?: anchor.BN;
  deploymentInfo: {
    antenna: number;
    elevation: number;
    azimuth: number;
    deprecatedMechanicalDownTilt: number;
    deprecatedElectricalDownTilt: number;
  };
};

type MobileHotspotInfo =
  anchor.IdlAccounts<HeliumEntityManager>["mobileHotspotInfoV0"];

const hasDeploymentInfo = (wi: WifiInfo) => {
  return !!(
    wi.deploymentInfo.antenna ||
    wi.deploymentInfo.elevation ||
    wi.deploymentInfo.azimuth ||
    wi.deploymentInfo.deprecatedMechanicalDownTilt ||
    wi.deploymentInfo.deprecatedElectricalDownTilt
  );
};

export const getH3Location = (lat: number, lng: number) => {
  try {
    const h3Index = latLngToCell(lat, lng, 12);
    return new anchor.BN(h3Index, 16);
  } catch (e) {
    return undefined;
  }
};

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
    pgUser: {
      default: "postgres",
    },
    pgPassword: {
      type: "string",
    },
    pgDatabase: {
      type: "string",
    },
    pgHost: {
      default: "localhost",
    },
    pgPort: {
      default: "5432",
    },
    commit: {
      type: "boolean",
      default: false,
    },
  });

  const argv = await yarg.argv;
  const commit = argv.commit;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const conn = provider.connection;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hem = await initHEM(provider);
  const isRds = argv.pgHost.includes("rds.amazon.com");
  const client = new Client({
    user: argv.pgUser,
    password: argv.pgPassword,
    host: argv.pgHost,
    database: argv.pgDatabase,
    port: Number(argv.pgPort),
    ssl: argv.noSsl
      ? {
          rejectUnauthorized: false,
        }
      : false,
  });

  await client.connect();
  const [subDao] = subDaoKey(MOBILE_MINT);
  const [rewardableEntityconfig] = rewardableEntityConfigKey(subDao, "MOBILE");
  const wifiInfos = (
    await client.query(`
      SELECT c.hs_pubkey,
       c.antenna,
       c.height AS elevation,
       c.azimuth AS azimuth,
       c.mt AS mechanical_down_tilt,
       c.et AS electrical_down_tilt
      FROM radios AS r
      JOIN calculations c ON r.last_success_calculation = c.id
      WHERE r.is_active IS TRUE
        AND radio_type = 'Wifi';
        `)
  ).rows.map(
    (wifiInfo: WifiInfoRow): WifiInfo => ({
      ...wifiInfo,
      location: getH3Location(Number(wifiInfo.lat), Number(wifiInfo.lng)),
      deploymentInfo: {
        antenna: Number(wifiInfo.antenna),
        elevation: Number(wifiInfo.elevation),
        azimuth: Number(wifiInfo.azimuth),
        deprecatedMechanicalDownTilt: Number(wifiInfo.mechanical_down_tilt),
        deprecatedElectricalDownTilt: Number(wifiInfo.electrical_down_tilt),
      },
    })
  );

  const mobileInfos = wifiInfos.map(
    (wifiInfo) => mobileInfoKey(rewardableEntityconfig, wifiInfo.hs_pubkey)[0]
  );

  const accountInfosWithPk = (
    await Promise.all(
      chunks(mobileInfos, 100).map((chunk) =>
        conn.getMultipleAccountsInfo(chunk)
      )
    )
  )
    .flat()
    .map((accountInfo, idx) => ({
      pubkey: mobileInfos[idx],
      wifiInfo: wifiInfos[idx],
      ...accountInfo,
    }));

  const ixs = (
    await Promise.all(
      accountInfosWithPk.map(async (acc) => {
        if (acc.data) {
          let correction: {
            location?: anchor.BN;
            deploymentInfo?: MobileDeploymentInfoV0;
          } = {};

          const decodedAcc: MobileHotspotInfo = hem.coder.accounts.decode(
            "mobileHotspotInfoV0",
            acc.data as Buffer
          );

          const deploymentInfoMissing =
            !decodedAcc.deploymentInfo && hasDeploymentInfo(acc.wifiInfo);

          const correctedDeploymentInfo = {
            antenna:
              acc.wifiInfo.deploymentInfo.antenna ||
              decodedAcc.deploymentInfo?.wifiInfoV0?.antenna ||
              0,
            elevation: decodedAcc.deploymentInfo?.wifiInfoV0?.elevation || 0,
            // elevation descrepency was found and backfilled so default to whats on chain
            // decodedAcc.deploymentInfo?.wifiInfoV0?.elevation ||
            // floored since stored on chain as i32 representation in whole meters
            // Math.floor(acc.wifiInfo.deploymentInfo.elevation) ||
            // 0,
            azimuth: decodedAcc.deploymentInfo?.wifiInfoV0?.azimuth || 0,
            // azimuth descrepency was found and backfilled so default to whats on chain
            // decodedAcc.deploymentInfo?.wifiInfoV0?.azimuth ||
            // acc.wifiInfo.deploymentInfo.azimuth ||
            // 0,
            deprecatedMechanicalDownTilt:
              decodedAcc.deploymentInfo?.wifiInfoV0
                ?.deprecatedMechanicalDownTilt || 0,
            // mechanicalDownTilt descrepency was found and backfilled so default to whats on chain
            // decodedAcc.deploymentInfo?.wifiInfoV0?.mechanicalDownTilt ||
            // acc.wifiInfo.deploymentInfo.mechanicalDownTilt ||
            // 0,
            deprecatedElectricalDownTilt:
              decodedAcc.deploymentInfo?.wifiInfoV0
                ?.deprecatedElectricalDownTilt || 0,
            // electricalDownTilt descrepency was found and backfilled so default to whats on chain
            // decodedAcc.deploymentInfo?.wifiInfoV0?.electricalDownTilt ||
            // acc.wifiInfo.deploymentInfo.electricalDownTilt ||
            // 0,
          };

          const deploymentInfoChanged = !deepEqual(
            decodedAcc.deploymentInfo?.wifiInfoV0,
            correctedDeploymentInfo
          );

          const locationMissing = !decodedAcc.location && acc.wifiInfo.location;

          if (deploymentInfoMissing || deploymentInfoChanged) {
            correction = {
              ...correction,
              deploymentInfo: {
                wifiInfoV0: correctedDeploymentInfo,
              },
            };
          }

          if (locationMissing) {
            correction = {
              ...correction,
              location: acc.wifiInfo.location,
            };
          }

          if (Object.keys(correction).length > 0) {
            if (!argv.commit) {
              console.log({
                pubkey: acc.pubkey,
                current: {
                  ...decodedAcc.deploymentInfo?.wifiInfoV0,
                },
                new: {
                  ...correctedDeploymentInfo,
                },
              });
            }

            return await hem.methods
              .tempBackfillMobileInfo({
                location: correction.location || null,
                deploymentInfo: correction.deploymentInfo || null,
              })
              .accountsPartial({
                payer: wallet.publicKey,
                mobileInfo: acc.pubkey,
              })
              .instruction();
          }
        }
      })
    )
  ).filter(truthy);

  console.log(`Total corrections needed: ${ixs.length}`);
  if (commit) {
    try {
      const transactions = await batchInstructionsToTxsWithPriorityFee(
        provider,
        ixs,
        { useFirstEstimateForAll: true }
      );

      await bulkSendTransactions(
        provider,
        transactions,
        console.log,
        10,
        [],
        100
      );
    } catch (e) {
      console.error("Failed to process mobile deployment info updates:", e);
      process.exit(1);
    }
  }
}
