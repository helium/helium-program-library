import * as anchor from "@coral-xyz/anchor";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import {
  delegatedDataCreditsKey,
  escrowAccountKey,
  init as initDataCredits,
} from "@helium/data-credits-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { DC_MINT, IOT_MINT, sendInstructions } from "@helium/spl-utils";
import {
  createAssociatedTokenAccountIdempotent,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
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
    state: {
      type: "string",
      alias: "s",
      default: "./export.json",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await initDataCredits(provider);

  let state = JSON.parse(fs.readFileSync(argv.state).toString());

  const routers = Object.entries(
    state.routers as unknown as Record<string, { owner: string }>
  );

  const [subdao] = subDaoKey(IOT_MINT);
  for (const [routerKey, { owner }] of routers) {
    const [delegatedDataCreditsK] = delegatedDataCreditsKey(subdao, routerKey);
    const [escrowKey] = escrowAccountKey(delegatedDataCreditsK);
    let amount = BigInt(0);
    try {
      amount = (await getAccount(provider.connection, escrowKey)).amount;
    } catch (e: any) {
      if (!e.toString().includes("TokenAccountNotFoundError")) {
        throw e;
      }
    }
    const ownerBalance = new anchor.BN(amount.toString());
    const ownerIsRouter = owner === routerKey;
    if (!ownerIsRouter) {
      console.log(`Router: ${routerKey}`);
      const account = state.accounts[routerKey];
      if (account) {
        const actualRouterBalance = new anchor.BN(account.dc);
        const toSend = actualRouterBalance.sub(ownerBalance);
        console.log(
          `  Balance is ${ownerBalance}, balance should be ${actualRouterBalance}, difference is ${toSend}`
        );
        if (actualRouterBalance.gt(ownerBalance)) {
          console.log(`    Delegating ${toSend}`);
          const sig = await program.methods
            .delegateDataCreditsV0({
              amount: toSend,
              routerKey,
            })
            .accountsPartial({
              subDao: subdao,
              dcMint: DC_MINT,
            })
            .rpc({ skipPreflight: true });
          console.log(sig);
        }

        // If the router has more than it should have gotten,
        // deduct that from the users data credit balance.
        let negativeBalance = new anchor.BN(0);
        if (toSend.lt(new anchor.BN(0))) {
          negativeBalance = toSend.mul(new anchor.BN(-1));
        }
        const toRefund = ownerBalance.sub(negativeBalance);
        const ownerSolAddr = toSolana(owner);
        if (ownerSolAddr) {
          console.log(`    Refunding ${toRefund}`);
          const sig = await program.methods
            .issueDataCreditsV0({
              amount: toRefund,
            })
            .accountsPartial({
              dcMint: DC_MINT,
              to: ownerSolAddr,
            });
          console.log(sig);
        }
      }
    }
  }
}

function toSolana(address: string): PublicKey | undefined {
  try {
    const addr = Address.fromB58(address);
    if (addr.keyType === ED25519_KEY_TYPE) return new PublicKey(addr.publicKey);
  } catch (e: any) {
    return undefined;
  }
}
