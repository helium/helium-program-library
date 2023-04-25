import * as anchor from "@coral-xyz/anchor";
import {
  init as initHsd,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import AWS from "aws-sdk";
import { BN } from "bn.js";
import os from "os";
import { Client } from "pg";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquads } from "./utils";
import fs from "fs";

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
    dntMint: {
      required: true,
      type: "string",
      describe: "DNT mint of the subdao to be updated",
    },
    name: {
      alias: "n",
      type: "string",
      required: false,
      describe: "The name of the entity config",
    },
    executeTransaction: {
      type: "boolean",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
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
    queryFile: {
      type: "string",
      default: `${__dirname}/../../../account-postgres-sink-service/vehnt.sql`
    },
    noSsl: {
      type: "boolean",
      default: false,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await initHsd(provider);

  // configure pg connection
  const isRds = argv.pgHost.includes("rds.amazonaws.com");
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
  const query = fs.readFileSync(argv.queryFile, "utf8");
  const response = (
    await client.query(query)
  ).rows;
  const row = response.find((x) => x.mint == argv.dntMint);

  const instructions = [];

  const subDao = subDaoKey(new PublicKey(argv.dntMint))[0];
  const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
  console.log("Subdao", subDao.toBase58());

  instructions.push(
    await program.methods
      .updateSubDaoVehntV0({
        vehntDelegated: new BN(row.real_ve_tokens.split(".")[0]),
        vehntLastCalculatedTs: new BN(row.current_ts),
        vehntFallRate: new BN(row.real_fall_rate.split(".")[0]),
      })
      .accounts({
        subDao,
        authority: subDaoAcc.authority,
      })
      .instruction()
  );

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet,
    {
      commitmentOrConfig: "finalized",
    }
  );
  await sendInstructionsOrSquads({
    provider,
    instructions,
    executeTransaction: argv.executeTransaction,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
