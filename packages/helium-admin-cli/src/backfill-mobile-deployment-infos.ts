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
  serial: string;
  lat: number;
  lng: number;
};

type WifiInfo = {
  hs_pubkey: string;
  location?: anchor.BN;
  deploymentInfo: {
    antenna: number;
    elevation: number;
    azimuth: number;
    mechanicalDownTilt: number;
    electricalDownTilt: number;
    serial: string;
  };
};

type MobileHotspotInfo =
  anchor.IdlAccounts<HeliumEntityManager>["mobileHotspotInfoV0"];

const hasDeploymentInfo = (wi: WifiInfo) => {
  return !!(
    wi.deploymentInfo.antenna ||
    wi.deploymentInfo.elevation ||
    wi.deploymentInfo.azimuth ||
    wi.deploymentInfo.mechanicalDownTilt ||
    wi.deploymentInfo.electricalDownTilt ||
    wi.deploymentInfo.serial
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
    noSsl: {
      type: "boolean",
      default: false,
      describe: "Disable SSL for database connection",
    },
  });

  const argv = await yarg.argv;
  const commit = argv.commit;

  console.log("Starting mobile deployment info backfill...");
  console.log(`Database: ${argv.pgDatabase}@${argv.pgHost}:${argv.pgPort}`);
  console.log(`Solana RPC: ${argv.url}`);
  console.log(`Commit mode: ${commit ? "ENABLED" : "DRY RUN"}`);

  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const conn = provider.connection;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hem = await initHEM(provider);
  const isRds = argv.pgHost.includes("rds.amazon.com");

  console.log("Connecting to database...");
  const client = new Client({
    user: argv.pgUser,
    password: argv.pgPassword,
    host: argv.pgHost,
    database: argv.pgDatabase,
    port: Number(argv.pgPort),
    ssl: argv.noSsl
      ? false
      : {
          rejectUnauthorized: false,
        },
  });

  await client.connect();
  console.log("✅ Database connected successfully");

  const [subDao] = subDaoKey(MOBILE_MINT);
  const [rewardableEntityconfig] = rewardableEntityConfigKey(subDao, "MOBILE");

  console.log("Fetching WiFi info from database...");
  const wifiInfos = (
    await client.query(`
      SELECT c.hs_pubkey,
       r.radio_serial_number as serial,
       c.antenna,
       c.height AS elevation,
       c.azimuth AS azimuth,
       c.mt AS mechanical_down_tilt,
       c.et AS electrical_down_tilt,
       ST_Y(c.loc) AS lat,
       ST_X(c.loc) AS lng
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
        mechanicalDownTilt: Number(wifiInfo.mechanical_down_tilt),
        electricalDownTilt: Number(wifiInfo.electrical_down_tilt),
        serial: wifiInfo.serial,
      },
    })
  );

  console.log(`Found ${wifiInfos.length} WiFi hotspots in database`);
  console.log(
    `${wifiInfos.filter(hasDeploymentInfo).length} have deployment info`
  );
  console.log(
    `${wifiInfos.filter((w) => w.location).length} have valid locations`
  );

  console.log(
    `${
      wifiInfos.filter((w) => w.deploymentInfo.serial).length
    } have valid serials`
  );

  const mobileInfos = wifiInfos.map(
    (wifiInfo) => mobileInfoKey(rewardableEntityconfig, wifiInfo.hs_pubkey)[0]
  );

  console.log("Fetching mobile info accounts from Solana...");
  const accountInfosWithPk = (
    await Promise.all(
      chunks(mobileInfos, 100).map(async (chunk, idx) => {
        console.log(
          `Batch ${idx + 1}/${Math.ceil(mobileInfos.length / 100)} (${
            chunk.length
          } accounts)`
        );
        return conn.getMultipleAccountsInfo(chunk);
      })
    )
  )
    .flat()
    .map((accountInfo, idx) => ({
      pubkey: mobileInfos[idx],
      wifiInfo: wifiInfos[idx],
      ...accountInfo,
    }));

  console.log(
    `Found ${
      accountInfosWithPk.filter((acc) => acc.data).length
    } existing mobile info accounts`
  );

  console.log("Analyzing accounts for corrections...");
  const ixs = (
    await Promise.all(
      accountInfosWithPk.map(async (acc, idx) => {
        if (idx % 100 === 0) {
          console.log(`Processed ${idx}/${accountInfosWithPk.length} accounts`);
        }

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
            azimuth: decodedAcc.deploymentInfo?.wifiInfoV0?.azimuth || 0,
            mechanicalDownTilt:
              decodedAcc.deploymentInfo?.wifiInfoV0?.mechanicalDownTilt || 0,
            electricalDownTilt:
              decodedAcc.deploymentInfo?.wifiInfoV0?.electricalDownTilt || 0,
            serial: acc.wifiInfo.deploymentInfo.serial || null,
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
              console.log("Correction needed:", {
                pubkey: acc.pubkey.toString(),
                current: {
                  ...(locationMissing && { location: decodedAcc.location }),
                  ...decodedAcc.deploymentInfo?.wifiInfoV0,
                },
                new: {
                  ...(locationMissing && { location: correction.location }),
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
    if (ixs.length === 0) {
      console.log("✅ No corrections needed, exiting");
      return;
    }

    console.log("Building and sending transactions...");
    try {
      const transactions = await batchInstructionsToTxsWithPriorityFee(
        provider,
        ixs,
        { useFirstEstimateForAll: true }
      );

      console.log(`Created ${transactions.length} transactions`);

      await bulkSendTransactions(
        provider,
        transactions,
        console.log,
        10,
        [],
        100
      );

      console.log("✅ All transactions completed successfully!");
    } catch (e) {
      console.error("❌ Failed to process mobile deployment info updates:", e);
      process.exit(1);
    }
  } else {
    console.log("Dry run complete - use --commit to apply changes");
  }
}
