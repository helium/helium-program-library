import yargs from "yargs/yargs";
import { exists, loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";
import os from "os";
import * as anchor from "@coral-xyz/anchor";
import { init } from "@helium/nft-proxy-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import fs from "fs";
import { sendInstructions } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

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
    registrar: {
      type: "string",
      required: true,
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to control the dao. If not provided, your wallet will be the authority",
    },
    proxySeasonsFile: {
      type: "string",
      default: `${__dirname}/../../proxy-seasons.json`,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));

  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }

  const delProgram = await init(provider);
  const vsrProgram = await initVsr(provider);
  const registrar = new PublicKey(argv.registrar);

  const proxySeasonsFile = fs.readFileSync(argv.proxySeasonsFile, "utf8");
  const seasons = JSON.parse(proxySeasonsFile).map((s) => ({
    start: new anchor.BN(Math.floor(Date.parse(s.start) / 1000)),
    end: new anchor.BN(Math.floor(Date.parse(s.end) / 1000)),
  }));

  const {
    pubkeys: { proxyConfig },
    instruction,
  } = await delProgram.methods
    .initializeProxyConfigV0({
      // Set max time to 2 years, though seasons should take precedent
      maxProxyTime: new anchor.BN(24 * 60 * 60 * 365 * 2),
      seasons,
      name: "Helium V1",
    })
    .accountsPartial({
      authority,
    })
    .prepare();

  if (!(await exists(provider.connection, proxyConfig!))) {
    console.log("Creating delegation config");
    await sendInstructions(provider, [instruction]);
  }

  console.log("Updating registrar to delegation config");
  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [
      await vsrProgram.methods
        .updateRegistrarV0()
        .accountsPartial({
          proxyConfig,
          registrar,
          realmAuthority: authority,
        })
        .instruction(),
    ],
    multisig: multisigPda!,
    signers: [],
  });
}
