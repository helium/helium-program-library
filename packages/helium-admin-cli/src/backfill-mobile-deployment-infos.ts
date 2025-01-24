import * as anchor from "@coral-xyz/anchor";
import {
  MobileDeploymentInfoV0,
  init as initHEM,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import {
  batchParallelInstructionsWithPriorityFee,
  chunks,
  MOBILE_MINT,
  truthy,
} from "@helium/spl-utils";
import AWS from "aws-sdk";
import os from "os";
import { Client } from "pg";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import deepEqual from "fast-deep-equal";
import { latLngToCell } from "h3-js";

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
  location: anchor.BN;
  deploymentInfo: {
    antenna: number;
    elevation: number;
    azimuth: number;
    mechanicalDownTilt: number;
    electricalDownTilt: number;
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
    wi.deploymentInfo.electricalDownTilt
  );
};

export const getH3Location = (lat: number, lng: number) => {
  const h3Index = latLngToCell(lat, lng, 12);
  return new anchor.BN(h3Index, 16);
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
    awsRegion: {
      default: "us-east-1",
    },
    noSsl: {
      type: "boolean",
      default: false,
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
  let password = argv.pgPassword;

  if (isRds && !password) {
    const signer = new AWS.RDS.Signer({
      region: argv.awsRegion,
      hostname: argv.pgHost,
      port: Number(argv.pgPort),
      username: argv.pgUser,
    });

    password = await new Promise((resolve, reject) =>
      signer.getAuthToken({}, (err, token) => {
        if (err) {
          return reject(err);
        }
        resolve(token);
      })
    );
  }

  const client = new Client({
    user: argv.pgUser,
    password,
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
  const wifiInfos = (await client.query(`SELECT * FROM wifi_infos`)).rows.map(
    (wifiInfo: WifiInfoRow): WifiInfo => ({
      ...wifiInfo,
      location: getH3Location(Number(wifiInfo.lat), Number(wifiInfo.lng)),
      deploymentInfo: {
        antenna: Number(wifiInfo.antenna),
        elevation: Number(wifiInfo.elevation),
        azimuth: Number(wifiInfo.azimuth),
        mechanicalDownTilt: Number(wifiInfo.mechanical_down_tilt),
        electricalDownTilt: Number(wifiInfo.electrical_down_tilt),
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
            "MobileHotspotInfoV0",
            acc.data as Buffer
          );

          const hasNewDeploymentInfo =
            !decodedAcc.deploymentInfo && hasDeploymentInfo(acc.wifiInfo);
          const deploymentInfoChanged = !deepEqual(
            decodedAcc.deploymentInfo?.wifiInfoV0,
            acc.wifiInfo.deploymentInfo
          );

          const locationMissing = !decodedAcc.location && acc.wifiInfo.location;
          const locationChanged =
            decodedAcc.location &&
            !acc.wifiInfo.location.eq(decodedAcc.location);

          if (hasNewDeploymentInfo || deploymentInfoChanged) {
            correction = {
              ...correction,
              deploymentInfo: {
                wifiInfoV0: {
                  ...acc.wifiInfo.deploymentInfo,
                },
              },
            };
          }

          if (locationMissing || locationChanged) {
            correction = {
              ...correction,
              location: acc.wifiInfo.location,
            };
          }

          if (Object.keys(correction).length > 0) {
            return await hem.methods
              .tempBackfillMobileInfo({
                location: correction.location || null,
                deploymentInfo: correction.deploymentInfo || null,
              })
              .accounts({
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
    await batchParallelInstructionsWithPriorityFee(provider, ixs);
  }
}
