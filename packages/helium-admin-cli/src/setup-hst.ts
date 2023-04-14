import { ClockworkProvider } from "@clockwork-xyz/sdk";
import * as anchor from "@coral-xyz/anchor";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { fanoutKey, init, membershipVoucherKey } from "@helium/fanout-sdk";
import { createMintInstructions, sendInstructions } from "@helium/spl-utils";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import { loadKeypair } from "@switchboard-xyz/solana.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import { createAndMint, exists } from "./utils";

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
    hnt: {
      type: "string",
      describe: "Pubkey of hnt",
      required: true,
    },
    state: {
      type: "string",
      alias: "s",
      default: `${__dirname}/../../migration-service/export.json`,
    },
    name: {
      type: "string",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to control the dao. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
    },
    hstKeypair: {
      type: "string",
      describe: "Keypair of the HST token",
      default: `${__dirname}/../keypairs/hst.json`,
    },
    hstReceiptBasePath: {
      type: "string",
      describe: "Keypair of the HST receipt token",
      default: `${__dirname}/../keypairs`
    },
    bucket: {
      type: "string",
      describe: "Bucket URL prefix holding all of the metadata jsons",
      default:
        "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib",
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hstKeypair = loadKeypair(argv.hstKeypair);

  let authority = provider.wallet.publicKey;
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet, {
      commitmentOrConfig: "finalized"
    }
  );
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }

  const state = JSON.parse(fs.readFileSync(argv.state).toString());
  const accounts = state.accounts as Record<string, any>;
  const hnt = new PublicKey(argv.hnt);
  const hst = hstKeypair.publicKey;
  const fanoutProgram = await init(provider);

  const totalHst: anchor.BN = Object.values(accounts).reduce(
    (acc: anchor.BN, v: any) => {
      if (v.hst) {
        return acc.add(new anchor.BN(v.hst));
      }

      return acc;
    },
    new anchor.BN(0)
  );
  await createAndMint({
    provider,
    mintKeypair: hstKeypair,
    amount: totalHst.toNumber() / 10 ** 8,
    decimals: 8,
    metadataUrl: `${argv.bucket}/hst.json`,
    updateAuthority: authority,
  });

  const fanout = fanoutKey(argv.name)[0];
  const hntAccount = await getAssociatedTokenAddressSync(hnt, fanout, true);
  console.log("Outputting hnt to", hntAccount.toBase58());
  if (!(await exists(provider.connection, fanout))) {
    await fanoutProgram.methods
      .initializeFanoutV0({
        name: argv.name,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accounts({
        authority,
        membershipMint: hst,
        fanoutMint: hnt,
      })
      .rpc({ skipPreflight: true });
  }

  const clockworkProvider = new ClockworkProvider(
    provider.wallet,
    provider.connection
  );

  for (const [address, account] of Object.entries(accounts)) {
    if (!account.hst || account.hst === 0 || account.hst === "0") {
      continue;
    }
    const solAddress: PublicKey | undefined = toSolana(address);
    if (!solAddress) {
      throw new Error("HST Owner that doesn't have a sol address " + address);
    }

    const hstAmount = new anchor.BN(account.hst);
    let mint: Keypair;
    const mintPath = `${argv.hstReceiptBasePath}/hst-receipt-${address}.json`;
    if (fs.existsSync(mintPath)) {
      mint = loadKeypair(mintPath);
    } else {
      mint = Keypair.generate();
      fs.writeFileSync(mintPath, JSON.stringify(Array.from(mint.secretKey)));
    }

    const [voucher] = membershipVoucherKey(mint.publicKey);
    if (!(await exists(provider.connection, voucher))) {
      await fanoutProgram.methods
        .stakeV0({
          amount: hstAmount,
        })
        .preInstructions(
          await createMintInstructions(provider, 0, voucher, voucher, mint)
        )
        .accounts({
          recipient: solAddress,
          fanout,
          mint: mint.publicKey
        })
        .signers([mint])
        .rpc({ skipPreflight: true });
    }

    // 2️⃣  Define a trigger condition.
    const trigger = {
      cron: {
        schedule: "0 30 0 * * * *",
        skippable: true,
      },
    };

    // 3️⃣ Create the thread.
    const threadId = `${argv.name}-${mint.publicKey.toBase58().slice(0, 8)}`;
    const [thread] = threadKey(provider.wallet.publicKey, threadId);
    console.log("Thread ID", threadId, thread.toBase58());
    const memberHntAccount = await getAssociatedTokenAddressSync(
      hnt,
      solAddress,
      true
    );
    if (!(await exists(provider.connection, memberHntAccount))) {
      await sendInstructions(provider, [
        createAssociatedTokenAccountIdempotentInstruction(
          provider.wallet.publicKey,
          memberHntAccount,
          solAddress,
          hnt
        ),
      ]);
    }

    const distributeIx = await fanoutProgram.methods
      .distributeV0()
      .accounts({
        payer: new PublicKey("C1ockworkPayer11111111111111111111111111111"),
        fanout,
        owner: solAddress,
        mint: mint.publicKey
      })
      .instruction();

    if (!(await exists(provider.connection, thread))) {
      const tx = await clockworkProvider.threadCreate(
        provider.wallet.publicKey, // authority
        threadId, // id
        [distributeIx], // instructions
        trigger, // trigger
        anchor.web3.LAMPORTS_PER_SOL // amount
      );
    } else {
      await clockworkProvider.threadUpdate(provider.wallet.publicKey, thread, {
        trigger,
      });
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

const CLOCKWORK_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);
export function threadKey(
  authority: PublicKey,
  threadId: string,
  programId: PublicKey = CLOCKWORK_PID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("thread", "utf8"),
      authority.toBuffer(),
      Buffer.from(threadId, "utf8"),
    ],
    programId
  );
}
