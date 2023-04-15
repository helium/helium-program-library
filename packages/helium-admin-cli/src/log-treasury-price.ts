import * as anchor from "@coral-xyz/anchor";
import { HNT_MINT, amountAsNum, toNumber, toBN } from "@helium/spl-utils";
import { init as initTreasuryManagement, treasuryManagementKey } from "@helium/treasury-management-sdk";
import { getAccount, getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
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
      type: "string",
      describe: "Mint id of the HNT token",
      default: HNT_MINT.toBase58(),
    },
    dntMint: {
      alias: "m",
      type: "string",
      describe: "Mint id of the subdao DNT token",
      required: true,
    },
    amount: {
      alias: "n",
      type: "string",
      required: true,
      describe: "Amount to get the price for, in bones"
    }
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const treasuryManagementProgram = await initTreasuryManagement(provider);
  const dntMint = new PublicKey(argv.dntMint);
  const hntMint = new PublicKey(argv.hntMint);

  const [treasuryManagementK] = treasuryManagementKey(dntMint);
  const treasuryManagement =
    await treasuryManagementProgram.account.treasuryManagementV0.fetch(
      treasuryManagementK
    );
  
  const fromMintAcc = await getMint(provider.connection, dntMint);
  const amount = toNumber(new anchor.BN(argv.amount), fromMintAcc.decimals);
  const toMintAcc = await getMint(provider.connection, hntMint);
  const treasuryAcc = await getAccount(
    provider.connection,
    treasuryManagement.treasury
  );
  const k =
    //@ts-ignore
    treasuryManagement.curve.exponentialCurveV0.k.toNumber() / Math.pow(10, 12);

  // only works for basic exponential curves
  // dR = (R / S^(1 + k)) ((S + dS)^(1 + k) - S^(1 + k))
  const S = Number(
    fromMintAcc.supply / BigInt(Math.pow(10, fromMintAcc.decimals))
  );
  const R = amountAsNum(treasuryAcc.amount, toMintAcc.decimals);
  
  const dR =
    (R / Math.pow(S, k + 1)) *
    (Math.pow(S - amount, k + 1) - Math.pow(S, k + 1));
  const output = Math.abs(dR);

  console.log(toBN(output, toMintAcc.decimals).toString())
}
