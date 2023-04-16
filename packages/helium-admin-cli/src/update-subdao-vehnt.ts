import * as anchor from "@coral-xyz/anchor";
import {
  init as initHsd,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
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
      type: "string"
    },
    pgDatabase: {
      type: "string"
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
      default: false
    }
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
    await client.query(`WITH
    readable_positions AS (
      SELECT p.*,
        r.realm_governing_token_mint,
        cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'lockupSaturationSecs' as numeric) as lockup_saturation_seconds,
        cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'maxExtraLockupVoteWeightScaledFactor' as numeric) / 1000000000 as max_extra_lockup_vote_weight_scaled_factor,
        CASE WHEN p.genesis_end > current_ts THEN cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'genesisVotePowerMultiplier' as numeric) ELSE 1 END as genesis_multiplier,
        cast(
            p.end_ts - 
            CASE WHEN lockup_kind = 'constant' THEN start_ts ELSE current_ts END
            as numeric
          ) as seconds_remaining
      FROM (
        SELECT *,
          lockup->>'kind' as lockup_kind,
          cast(lockup->>'endTs' as numeric) as end_ts,
          cast(lockup->>'startTs' as numeric) as start_ts,
          -- 1680892887 as current_ts
          FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)) as current_ts
        FROM positions 
      ) p
      JOIN registrars r on p.registrar = r.address
    ),
    positions_with_vehnt AS (
      SELECT realm_governing_token_mint as mint,
        address,
        num_active_votes,
        registrar,
        refreshed_at,
        created_at,
        amount_deposited_native,
        ve_tokens,
        initial_ve_tokens,
        CASE WHEN lockup_kind = 'constant' THEN 0 ELSE ve_tokens / (end_ts - current_ts) END as fall_rate,
        start_ts,
        end_ts,
        current_ts
      FROM (
        SELECT *,
          amount_deposited_native * (
            LEAST(
              seconds_remaining / lockup_saturation_seconds,
              1
            ) * (
              max_extra_lockup_vote_weight_scaled_factor
            ) * genesis_multiplier
          ) as ve_tokens,
          amount_deposited_native * (
            LEAST(
              (end_ts - start_ts) / lockup_saturation_seconds,
              1
            ) * (
              max_extra_lockup_vote_weight_scaled_factor
            ) * genesis_multiplier 
          ) as initial_ve_tokens
        FROM readable_positions
      ) a
    ),
    subdao_delegations AS (
      SELECT
        count(*) as delegations,
        sum(p.fall_rate) as real_fall_rate,
        min(s.vehnt_fall_rate) / 1000000000000 as approx_fall_rate,
        s.dnt_mint as mint,
        min(current_ts) current_ts,
        SUM(ve_tokens) as real_ve_tokens,
        (
          MIN(s.vehnt_delegated) - (
            (min(current_ts) - min(s.vehnt_last_calculated_ts))
             * min(s.vehnt_fall_rate)
          )
        ) / 1000000000000 as approx_ve_tokens,
        MIN(s.vehnt_delegated) as vehnt_delegated_snapshot,
        min(s.vehnt_last_calculated_ts) as vehnt_last_calculated_ts
      FROM positions_with_vehnt p
      JOIN delegated_positions d on d.position = p.address
      JOIN sub_daos s on s.address = d.sub_dao
      GROUP BY s.dnt_mint
    )
  SELECT 
    mint,
    current_ts,
    delegations,
    real_ve_tokens * 1000000000000 as real_ve_tokens,
    approx_ve_tokens * 1000000000000 as approx_ve_tokens,
    real_fall_rate * 1000000000000 as real_fall_rate,
    approx_fall_rate * 1000000000000 as approx_fall_rate,
    approx_fall_rate - real_fall_rate as fall_rate_diff,
    approx_ve_tokens - real_ve_tokens as ve_tokens_diff
  FROM subdao_delegations`)
  ).rows;
  const row = response.find((x) => x.mint == argv.dntMint);
  console.log("Setting", row);

  const instructions = [];

  const subDao = subDaoKey(new PublicKey(argv.dntMint))[0];
  const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
  console.log("Subdao", subDao.toBase58())

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
    provider.wallet, {
      commitmentOrConfig: "finalized"
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
