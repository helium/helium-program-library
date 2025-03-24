import * as anchor from "@coral-xyz/anchor";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import {
  init as initHEM,
  programApprovalKey,
  sharedMerkleKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  devaddrConstraintKey,
  init as initIRM,
  netIdKey,
  organizationDelegateKey,
  organizationKey,
  routingManagerKey,
} from "@helium/iot-routing-manager-sdk";
import {
  batchParallelInstructionsWithPriorityFee,
  HNT_MINT,
  DC_MINT,
  IOT_MINT,
  sendInstructionsWithPriorityFee,
  truthy,
} from "@helium/spl-utils";
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import AWS from "aws-sdk";
import os from "os";
import { Client } from "pg";
import yargs from "yargs/yargs";
import { exists, loadKeypair } from "./utils";

type Org = {
  oui: number;
  owner_pubkey: string;
  payer_pubkey: string;
  locked: boolean;
};

type OrgDelegate = {
  oui: number;
  delegate_pubkey: string;
};

type DevaddrConstraint = {
  oui: number;
  net_id: number;
  start_addr: number;
  end_addr: number;
};

const toSolana = (address: string): PublicKey | undefined => {
  try {
    const addr = Address.fromB58(address);
    if (addr.keyType === ED25519_KEY_TYPE) return new PublicKey(addr.publicKey);
  } catch (e: any) {
    return undefined;
  }
};

const overflowedI64ToU64 = (overflowedI64: number) => {
  const MAX_U64 = new anchor.BN("18446744073709551616"); // 2^64
  const i64Value = new anchor.BN(overflowedI64);
  if (i64Value.lt(new anchor.BN(0))) {
    return MAX_U64.add(i64Value);
  }
  return i64Value;
};

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    ouiWallet: {
      required: true,
      type: "string",
      describe: "Address of wallet to control oui operations",
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
    metadataUrl: {
      required: true,
      type: "string",
      describe: "Json metadata for the collection",
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const conn = provider.connection;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const ouiWallet = new PublicKey(argv.ouiWallet);
  const irm = await initIRM(provider);
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
  const orgs: Org[] = (await client.query(`SELECT * FROM organizations`)).rows;

  const orgDelegates: OrgDelegate[] = (
    await client.query(`SELECT * FROM organization_delegate_keys`)
  ).rows;

  const devaddrConstraints: DevaddrConstraint[] = (
    await client.query(`SELECT * FROM organization_devaddr_constraints`)
  ).rows;

  const [dao] = daoKey(HNT_MINT);
  const [subDao] = subDaoKey(IOT_MINT);
  const [sharedMerkle] = sharedMerkleKey(3);
  const [programApproval] = programApprovalKey(dao, irm.programId);
  const [routingManager] = routingManagerKey(subDao);
  const netIds = [
    ...devaddrConstraints.reduce(
      (acc, d) => acc.add(d.net_id),
      new Set<number>()
    ),
  ];

  if (!(await exists(conn, programApproval))) {
    console.log(`Approving program`);
    await sendInstructionsWithPriorityFee(provider, [
      await hem.methods
        .approveProgramV0({
          programId: irm.programId,
        })
        .accountsPartial({ dao })
        .instruction(),
    ]);
  }

  if (!(await exists(conn, sharedMerkle))) {
    const merkle = Keypair.generate();
    const space = getConcurrentMerkleTreeAccountSize(20, 64, 17);
    console.log(`Initializing sharedMerkle`);
    await sendInstructionsWithPriorityFee(
      provider,
      [
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: merkle.publicKey,
          lamports: await conn.getMinimumBalanceForRentExemption(space),
          space: space,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        }),
        await hem.methods
          .initializeSharedMerkleV0({ proofSize: 3 })
          .accountsPartial({ merkleTree: merkle.publicKey })
          .instruction(),
      ],
      {
        signers: [merkle],
        computeUnitLimit: 500000,
      }
    );
  }

  if (!(await exists(conn, routingManager))) {
    console.log(`Initializing routingManager ${routingManager.toBase58()}`);
    await sendInstructionsWithPriorityFee(
      provider,
      [
        await irm.methods
          .initializeRoutingManagerV0({
            metadataUrl: argv.metadataUrl,
            devaddrFeeUsd: new anchor.BN(100_000000),
            ouiFeeUsd: new anchor.BN(100_000000),
          })
          .accountsPartial({
            updateAuthority: wallet.publicKey,
            netIdAuthority: wallet.publicKey,
            dcMint: DC_MINT,
            subDao,
            dao,
          })
          .instruction(),
      ],
      {
        computeUnitLimit: 500000,
      }
    );
  }

  const netIdIxs = (
    await Promise.all(
      netIds.map(async (netId) => {
        const [netIdK] = netIdKey(routingManager, new anchor.BN(netId));

        if (!(await exists(conn, netIdK))) {
          return await irm.methods
            .initializeNetIdV0({
              netId,
            })
            .accountsPartial({
              authority: wallet.publicKey,
              routingManager,
            })
            .instruction();
        }
      })
    )
  ).filter(truthy);

  console.log(`Initializing (${netIdIxs.length}) netIds`);
  await batchParallelInstructionsWithPriorityFee(provider, netIdIxs);

  const orgIxs = (
    await Promise.all(
      orgs.map(async (org) => {
        const netId = devaddrConstraints.find((d) => d.oui === org.oui)
          ?.net_id!;
        const [netIdK] = netIdKey(routingManager, new anchor.BN(netId));
        const [orgK] = organizationKey(routingManager, new anchor.BN(org.oui));
        const ownerSolAddr = toSolana(org.owner_pubkey);

        if (!ownerSolAddr) {
          throw new Error(
            `Owner doesn't have a sol address ${org.owner_pubkey}`
          );
        }

        if (!(await exists(conn, orgK))) {
          return await irm.methods
            .tempBackfillOrganization({
              oui: new anchor.BN(org.oui),
              escrowKeyOverride: org.payer_pubkey,
            })
            .accountsPartial({
              authority: ownerSolAddr,
              netId: netIdK,
            })
            .instruction();
        }
      })
    )
  ).filter(truthy);

  console.log(`Initializing (${orgIxs.length}) organizations`);
  await batchParallelInstructionsWithPriorityFee(provider, orgIxs);

  const orgApprovalIxs = (
    await Promise.all(
      orgs.map(async (org) => {
        const [orgK] = organizationKey(routingManager, new anchor.BN(org.oui));
        if (
          !(await exists(conn, orgK)) ||
          !(await irm.account.organizationV0.fetch(orgK)).approved
        ) {
          return await irm.methods
            .approveOrganizationV0()
            .accountsPartial({ organization: orgK })
            .instruction();
        }
      })
    )
  ).filter(truthy);

  console.log(`Approving (${orgApprovalIxs.length}) organizations`);
  await batchParallelInstructionsWithPriorityFee(provider, orgApprovalIxs);

  const orgDelegateIxs = (
    await Promise.all(
      orgDelegates.map(async (orgDelegate) => {
        const [orgK] = organizationKey(
          routingManager,
          new anchor.BN(orgDelegate.oui)
        );

        if (!(await exists(conn, orgK))) {
          throw new Error(`Organization not found ${orgK.toBase58()}`);
        }

        const delegateSolAddr = toSolana(orgDelegate.delegate_pubkey);
        if (!delegateSolAddr) {
          console.log(
            `Delegate doesn't have a sol address, skipping delegate: ${orgDelegate.delegate_pubkey} oui: ${orgDelegate.oui}`
          );
        }

        if (delegateSolAddr) {
          const [orgDelegateK] = organizationDelegateKey(orgK, delegateSolAddr);
          if (!(await exists(conn, orgDelegateK))) {
            return await irm.methods
              .tempBackfillOrganizationDelegate()
              .accountsPartial({
                payer: wallet.publicKey,
                organization: orgK,
                delegate: delegateSolAddr,
              })
              .instruction();
          }
        }
      })
    )
  ).filter(truthy);

  console.log(`Initializing (${orgDelegateIxs.length}) orgDelegates`);
  await batchParallelInstructionsWithPriorityFee(provider, orgDelegateIxs);

  const devaddrIxs = (
    await Promise.all(
      devaddrConstraints.map(async (devaddr) => {
        const startAddrBn = overflowedI64ToU64(devaddr.start_addr);
        const endAddrBn = overflowedI64ToU64(devaddr.end_addr);
        const numBlocksBn = endAddrBn
          .add(new anchor.BN(1))
          .sub(startAddrBn)
          .div(new anchor.BN(8));

        const [orgK] = organizationKey(
          routingManager,
          new anchor.BN(devaddr.oui)
        );

        if (!(await exists(conn, orgK))) {
          throw new Error(`Organization not found ${orgK.toBase58()}`);
        }

        const [devaddrConstraintK] = devaddrConstraintKey(orgK, startAddrBn);
        if (!(await exists(conn, devaddrConstraintK))) {
          return await irm.methods
            .tempBackfillDevaddrConstraint({
              startAddr: startAddrBn,
              numBlocks: numBlocksBn.toNumber(),
            })
            .accountsPartial({
              organization: orgK,
            })
            .instruction();
        }
      })
    )
  ).filter(truthy);

  console.log(`Initializing (${devaddrIxs.length}) devaddrConstraints`);
  await batchParallelInstructionsWithPriorityFee(provider, devaddrIxs);

  if (
    (await exists(conn, routingManager)) &&
    !(
      await irm.account.iotRoutingManagerV0.fetch(routingManager)
    ).netIdAuthority.equals(ouiWallet)
  ) {
    console.log(`Updating routingManager netIdAuthority to ${argv.ouiWallet}`);
    await batchParallelInstructionsWithPriorityFee(provider, [
      await irm.methods
        .updateRoutingManagerV0({
          updateAuthority: null,
          netIdAuthority: ouiWallet,
          devaddrFeeUsd: null,
          ouiFeeUsd: null,
        })
        .accountsPartial({
          updateAuthority: wallet.publicKey,
          routingManager,
        })
        .instruction(),
    ]);
  }

  const netIdUpdateIxs = (
    await Promise.all(
      netIds.map(async (netId) => {
        const [netIdK] = netIdKey(routingManager, new anchor.BN(netId));
        if (
          (await exists(conn, netIdK)) &&
          !(await irm.account.netIdV0.fetch(netIdK)).authority.equals(ouiWallet)
        ) {
          return await irm.methods
            .updateNetIdV0({
              authority: ouiWallet,
            })
            .accountsPartial({
              authority: wallet.publicKey,
              netId: netIdK,
            })
            .instruction();
        }
      })
    )
  ).filter(truthy);

  if (netIdUpdateIxs.length > 0) {
    console.log(
      `Updating (${netIdUpdateIxs.length}) netIdAuthorites to ${argv.ouiWallet}`
    );
    await batchParallelInstructionsWithPriorityFee(provider, netIdUpdateIxs);
  }
}
