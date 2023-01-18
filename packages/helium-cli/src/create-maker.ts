import Address from "@helium/address";
import {
  init as initHem,
  makerKey,
  rewardableEntityConfigKey,
  makerApprovalKey,
} from "@helium/helium-entity-manager-sdk";
import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { humanReadable, sendInstructions, truthy } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import { exists, loadKeypair, sendInstructionsOrCreateProposal } from "./utils";

const { hideBin } = require("yargs/helpers");
const yarg = yargs(hideBin(process.argv)).options({
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
  subdaoMint: {
    required: true,
    describe: "Public Key of the subdao mint",
    type: "string",
  },
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
  },
  fromFile: {
    describe: "Load makers from a json file and create in bulk",
    required: false,
    type: "string",
  },
  name: {
    alias: "n",
    type: "string",
    required: false,
    describe: "The name of the maker",
  },
  makerKey: {
    alias: "m",
    type: "string",
    describe: "*Helium* Public Key of a maker",
    required: false,
  },
  makerCount: {
    alias: "c",
    type: "number",
    describe: "Estimated number of hotspots this maker will have",
    required: false,
  },
  symbol: {
    alias: "s",
    type: "string",
    required: true,
    describe: " The symbol of the entity config",
  },
  councilKeypair: {
    type: "string",
    describe: "Keypair of gov council token",
    default: "./keypairs/council.json",
  },
});

// Goal = 3 proof nodes needed
const merkleSizes = [
  [3, 8, 0],
  [5, 8, 2],
  [14, 64, 11],
  // [16, 64, 13],
  // [18, 64, 15],
  [20, 64, 17],
  [24, 64, 17],
];

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const wallet = loadKeypair(argv.wallet);
  const govProgramId = new PublicKey(argv.govProgramId);
  const councilKeypair = await loadKeypair(argv.councilKeypair);

  const name = argv.name;
  const symbol = argv.symbol;

  let makers = [
    {
      name,
      address: argv.makerKey,
      count: argv.makerCount || 300000,
    },
  ];

  if (argv.fromFile) {
    makers = JSON.parse(fs.readFileSync(argv.fromFile, "utf-8"));
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);
  const hsdProgram = await initHsd(provider);
  console.log(makers);
  const conn = provider.connection;

  console.log(
    humanReadable(
      new anchor.BN(
        (
          await Promise.all(
            makers.map(async ({ name, address, count }) => {
              const [size, buffer, canopy] = merkleSizes.find(
                ([height]) => Math.pow(2, height) > count * 2
              );
              const space = getConcurrentMerkleTreeAccountSize(
                size,
                buffer,
                canopy
              );
              return await provider.connection.getMinimumBalanceForRentExemption(
                space
              );
            })
          )
        ).reduce((acc, a) => acc + a)
      ),
      9
    )
  );

  const subdaoMint = new PublicKey(argv.subdaoMint);
  const subdao = (await subDaoKey(subdaoMint))[0];
  const entityConfigKey = (
    await rewardableEntityConfigKey(subdao, symbol.toUpperCase())
  )[0];

  const subdaoAcc = await hsdProgram.account.subDaoV0.fetch(subdao);
  const authorityAcc = await provider.connection.getAccountInfo(
    subdaoAcc.authority
  );
  let payer = provider.wallet.publicKey;
  const isGov = authorityAcc != null && authorityAcc.owner.equals(govProgramId);
  if (isGov) {
    const nativeTreasury = await PublicKey.findProgramAddressSync(
      [Buffer.from("native-treasury", "utf-8"), subdaoAcc.authority.toBuffer()],
      govProgramId
    )[0];
    payer = nativeTreasury;
  }

  const instructions = await Promise.all(
    makers.map(async ({ name, address, count }) => {
      const makerAuthority = new PublicKey(Address.fromB58(address).publicKey);
      const [size, buffer, canopy] = merkleSizes.find(
        ([height]) => Math.pow(2, height) > count * 2
      );
      const space = getConcurrentMerkleTreeAccountSize(size, buffer, canopy);
      const maker = await makerKey(name)[0];
      const rent = await provider.connection.getMinimumBalanceForRentExemption(
        space
      );

      const authority = (
        await hemProgram.account.rewardableEntityConfigV0.fetch(entityConfigKey)
      ).authority;

      const instructions = [];
      if (!(await exists(conn, maker))) {
        console.log(
          `
            Creating maker with helium addr: ${address}.
            Solana addr: ${makerAuthority.toBase58()}.
            Size: ${size}, buffer: ${buffer}, canopy: ${canopy}. 
            Space: ${space} bytes
            Cost: ~${humanReadable(new anchor.BN(rent), 9)} Sol
            `
        );

        if (space > 10000000) {
          throw new Error(
            `Space ${space} more than 10mb for tree ${size}, ${buffer}, ${canopy}}`
          );
        }

        console.log("Auth is", authority.toBase58());
        let merkle: Keypair;
        const merklePath = `./keypairs/merkle-${address}.json`;
        if (fs.existsSync(merklePath)) {
          merkle = loadKeypair(merklePath);
        } else {
          merkle = Keypair.generate();
          fs.writeFileSync(
            merklePath,
            JSON.stringify(Array.from(merkle.secretKey))
          );
        }

        const create = await hemProgram.methods
          .initializeMakerV0({
            name,
            metadataUrl: "todo",
            issuingAuthority: makerAuthority,
            updateAuthority: authority,
          })
          .accounts({
            maker,
            payer,
          })
          .instruction();

        const setTree = await hemProgram.methods
          .setMakerTreeV0({
            maxDepth: size,
            maxBufferSize: buffer,
          })
          .accounts({ maker, merkleTree: merkle.publicKey })
          .instruction();

        if (!(await exists(conn, merkle.publicKey))) {
          await sendInstructions(
            provider,
            [
              SystemProgram.createAccount({
                fromPubkey: payer,
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
      } else {
        instructions.push(
          await hemProgram.methods.updateMakerV0({
            issuingAuthority: makerAuthority,
            updateAuthority: authority
          })
          .accounts({ maker })
          .instruction()
        )
      }

      let approve;
      if (!(await exists(conn, makerApprovalKey(entityConfigKey, maker)[0]))) {
        approve = await hemProgram.methods
          .approveMakerV0()
          .accounts({
            maker,
            rewardableEntityConfig: entityConfigKey,
            authority,
            payer,
          })
          .instruction();
        instructions.push(approve);
      }
      

      return instructions;
    })
  );

  if (isGov) {
    const instrs = instructions.flat().filter(truthy);
    await sendInstructionsOrCreateProposal({
      provider,
      instructions: instrs,
      walletSigner: wallet,
      signers: [],
      govProgramId,
      proposalName: `Create Makers`,
      votingMint: councilKeypair.publicKey,
    });
  } else {
    for (const instrs of instructions) {
      await sendInstructions(provider, instrs, []);
    }
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
