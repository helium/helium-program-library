import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  makerKey
} from "@helium/helium-entity-manager-sdk";
import {
  daoKey,
  init as initHsd
} from "@helium/helium-sub-daos-sdk";
import {
  HNT_MINT,
  humanReadable,
  sendInstructions,
  truthy,
  withPriorityFees
} from "@helium/spl-utils";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import {
  exists,
  loadKeypair,
  merkleSizes
} from "./utils";

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
    name: {
      alias: "n",
      type: "string",
      required: true,
      describe: "The name of the maker",
    },
    issuingAuthority: {
      type: "string",
      describe: "Key that can issue hotspots on behalf of this maker",
      required: true,
    },
    updateAuthority: {
      type: "string",
      describe: "Key that can update the maker's issuing authority",
      required: true,
    },
    metadataUrl: {
      type: "string",
      describe: "URL to metadata for this maker. Should be JSON with at least { name, image, description }",
      required: true,
    },
    makerCount: {
      alias: "c",
      type: "number",
      describe: "Estimated number of hotspots this maker will have",
      required: true,
    },
    merkleBasePath: {
      type: "string",
      describe: "Base path for merkle keypairs",
      default: `${__dirname}`,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const name = argv.name;

  const count = argv.makerCount;
  const issuingAuthority = new PublicKey(argv.issuingAuthority);
  const updateAuthority = new PublicKey(argv.updateAuthority);

  const hemProgram = await initHem(provider);
  const conn = provider.connection;
  const daoK = daoKey(HNT_MINT)[0];
  let daoPayer = provider.wallet.publicKey;

  let totalSol = 0;
  const instructions: TransactionInstruction[] = [];
  const [size, buffer, canopy] = merkleSizes.find(
    ([height]) => Math.pow(2, height) > count * 2
  )!;
  const space = getConcurrentMerkleTreeAccountSize(size, buffer, canopy);
  const maker = await makerKey(daoK, name!)[0];
  const rent = await provider.connection.getMinimumBalanceForRentExemption(
    space
  );
  totalSol += rent;

  let merkle: Keypair;
  const merklePath = `${argv.merkleBasePath}/merkle-${maker.toBase58()}.json`;
  if (fs.existsSync(merklePath)) {
    merkle = loadKeypair(merklePath);
  } else {
    merkle = Keypair.generate();
    fs.writeFileSync(merklePath, JSON.stringify(Array.from(merkle.secretKey)));
  }

  if (!(await exists(conn, maker))) {
    console.log(
      `
            Creating maker with address: ${maker.toBase58()}
            Issuing Authority: ${issuingAuthority.toBase58()}.
            Capacity: 2^${size}, buffer: ${buffer}, canopy: ${canopy}.
            Space: ${space} bytes
            Cost: ~${humanReadable(new anchor.BN(rent), 9)} Sol
            `
    );

    if (space > 10000000) {
      throw new Error(
        `Space ${space} more than 10mb for tree ${size}, ${buffer}, ${canopy}}`
      );
    }

    const create = await hemProgram.methods
      .initializeMakerV0({
        name: name!,
        metadataUrl: argv.metadataUrl,
        issuingAuthority,
        // Temp, since we need to set maker tree
        updateAuthority: provider.wallet.publicKey,
      })
      .accountsPartial({
        maker,
        payer: daoPayer,
        dao: daoK,
      })
      .instruction();

    const setTree = await hemProgram.methods
      .setMakerTreeV0({
        maxDepth: size,
        maxBufferSize: buffer,
      })
      .accountsPartial({
        maker,
        merkleTree: merkle.publicKey,
        payer: daoPayer,
        updateAuthority: provider.wallet.publicKey,
      })
      .instruction();

    if (!(await exists(conn, merkle.publicKey))) {
      await sendInstructions(
        provider,
        [
          SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: merkle.publicKey,
            lamports:
              await provider.connection.getMinimumBalanceForRentExemption(
                space
              ),
            space: space,
            programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          }),
        ],
        [merkle]
      );
    }
    instructions.push(...[create, setTree].filter(truthy));
    if (!updateAuthority.equals(provider.wallet.publicKey)) {
      instructions.push(
        await hemProgram.methods
          .updateMakerV0({
            issuingAuthority,
            updateAuthority,
          })
          .accountsPartial({ maker, updateAuthority: provider.wallet.publicKey })
          .instruction()
      );
    }
  } else {
    const makerAcc = await hemProgram.account.makerV0.fetch(maker);
    instructions.push(
      await hemProgram.methods
        .updateMakerV0({
          issuingAuthority,
          updateAuthority,
        })
        .accountsPartial({ maker, updateAuthority: makerAcc.updateAuthority })
        .instruction()
    );

    if (makerAcc.merkleTree.equals(SystemProgram.programId)) {
      const setTree = await hemProgram.methods
        .setMakerTreeV0({
          maxDepth: size,
          maxBufferSize: buffer,
        })
        .accountsPartial({
          maker,
          merkleTree: merkle.publicKey,
          payer: daoPayer,
          updateAuthority,
        })
        .instruction();
      if (!(await exists(conn, merkle.publicKey))) {
        await sendInstructions(
          provider,
          [
            SystemProgram.createAccount({
              fromPubkey: provider.wallet.publicKey,
              newAccountPubkey: merkle.publicKey,
              lamports:
                await provider.connection.getMinimumBalanceForRentExemption(
                  space
                ),
              space: space,
              programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            }),
          ],
          [merkle]
        );
      }
      instructions.push(setTree);
    }
  }

  console.log("Total sol needed: ", humanReadable(new anchor.BN(totalSol), 9));

  const balance = await provider.connection.getBalance(
    provider.wallet.publicKey
  );
  if (balance < totalSol) {
    throw new Error(
      `Insufficient balance: ${humanReadable(
        new anchor.BN(Math.floor(balance)),
        9
      )} < ${humanReadable(new anchor.BN(totalSol), 9)}`
    );
  }

  await sendInstructions(
    provider,
    await withPriorityFees({
      connection: provider.connection,
      instructions,
      feePayer: provider.wallet.publicKey
    })
  );
}
