import * as anchor from "@coral-xyz/anchor";
import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import { BN } from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquads, getUnixTimestamp } from "./utils";
import { Client } from "pg";
import AWS from "aws-sdk";

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
  const response = (
    await client.query(`
      select p.address as paddr, d.address as daddr from positions p 
      JOIN delegated_positions d on d.position = p.address 
      where cast(lockup->>'endTs' as numeric) - cast(lockup->>'startTs' as numeric) > (60 * 60 * 24 * 365 * 4) OR 
            CAST(lockup ->>'endTs' as numeric) <> genesis_end;
    `)
  ).rows;

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet,
    {
      commitmentOrConfig: "finalized",
    }
  );

  let authority = provider.wallet.publicKey;
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }
  console.log(response);
  const instructions = [];
  for (const row of response) {
    instructions.push(
      await program.methods
        .repairDelegationV0()
        .accounts({
          authority,
          position: new PublicKey(row.paddr),
        })
        .instruction(),
    );
    console.log("Repairing delegation", row.paddr, row.daddr);
  }

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
