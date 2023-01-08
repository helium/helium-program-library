import {
  rewardableEntityConfigKey,
  makerKey,
  init as initHem,
} from "@helium/helium-entity-manager-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import Address from "@helium/address";
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
  makerKey: {
    alias: "m",
    type: "string",
    describe: "*Helium* Public Key of a maker",
    required: true,
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
  name: {
    alias: "n",
    type: "string",
    required: true,
    describe: "The name of the maker",
  },
  symbol: {
    alias: "s",
    type: "string",
    required: true,
    describe:" The symbol of the entity config"
  },
  councilKeypair: {
    type: "string",
    describe: "Keypair of gov council token",
    default: "./keypairs/council.json",
  },
});

async function run() {
  const argv = await yarg.argv;
  console.log(argv.url);
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const wallet = loadKeypair(argv.wallet);
  const govProgramId = new PublicKey(argv.govProgramId);
  const councilKeypair = await loadKeypair(argv.councilKeypair);

  const name = argv.name;
  const symbol = argv.symbol

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);
  const makerAuthority = new PublicKey(Address.fromB58(argv.makerKey).publicKey);
  console.log(
    `Using maker with helium addr: ${
      argv.makerKey
    }, solana addr: ${makerAuthority.toBase58()}`
  );

  const conn = provider.connection;

  const subdaoMint = new PublicKey(argv.subdaoMint);
  const subdao = (await subDaoKey(subdaoMint))[0];
  const entityConfigKey = (await rewardableEntityConfigKey(subdao, symbol.toUpperCase()))[0];

  const maker = await makerKey(name)[0];

  // console.log("Issuer: ", await hemProgram.account.makerV0.fetch(makerKey));
  if (!(await exists(conn, maker))) {
    console.log("Initalizing Maker");

    const authority = (await hemProgram.account.rewardableEntityConfigV0.fetch(entityConfigKey)).authority;
    console.log("Auth is", authority);
    const create = await hemProgram.methods
      .initializeMakerV0({
        name,
        metadataUrl: "todo",
        authority: makerAuthority,
        maxDepth: 26,
        maxBufferSize: 1024,
      })
      .accounts({
        maker
      })
      .instruction();

    const approve = await hemProgram.methods
      .approveMakerV0()
      .accounts({
        maker,
        rewardableEntityConfig: entityConfigKey,
        authority,
      })
      .instruction();

    await sendInstructionsOrCreateProposal({
      provider,
      instructions: [
        create,
        approve,
      ],
      walletSigner: wallet,
      signers: [],
      govProgramId,
      proposalName: `Create Maker ${name}, ${argv.makerKey}`,
      votingMint: councilKeypair.publicKey,
    });
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
