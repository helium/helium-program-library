import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { carrierKey, init as initMem } from "@helium/mobile-entity-manager-sdk";
import { HNT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";

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
    hntMint: {
      default: HNT_MINT.toBase58(),
    },
    dntMint: {
      default: MOBILE_MINT.toBase58(),
      describe: "Public Key of the subdao mint",
      type: "string",
    },
    name: {
      alias: "n",
      type: "string",
      required: true,
      describe: "The name of the carrier",
    },
    recipient: {
      describe:
        "Recipient of the rewardable mapping rewards nft, default to this wallet",
      type: "string",
      required: false,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const name = "Helium Mobile Service Rewards";
  const hemProgram = await initHem(provider);
  const memProgram = await initMem(provider);
  const dntMint = new PublicKey(argv.dntMint);
  const subDao = (await subDaoKey(dntMint))[0];

  const carrier = await carrierKey(subDao, argv.name)[0];
  const hntMint = new PublicKey(argv.hntMint);
  const recipient = argv.recipient
    ? new PublicKey(argv.recipient)
    : provider.wallet.publicKey;
  const [keyToAssetK] = keyToAssetKey(
    daoKey(hntMint)[0],
    Buffer.from(name, "utf-8")
  );
  const keyToAsset = await hemProgram.account.keyToAssetV0.fetchNullable(
    keyToAssetK
  );

  if (!keyToAsset) {
    console.log("Minting service rewards NFT");
    console.log(
      await memProgram.methods
        .issueServiceRewardsNftV0({
          metadataUrl: `https://entities.nft.helium.io/Helium%20Mobile%20Service%20Rewards`,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({ carrier, recipient, keyToAsset: keyToAssetK })
        .rpc({ skipPreflight: false })
    );
  }
}
