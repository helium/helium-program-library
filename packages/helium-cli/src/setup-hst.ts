import * as anchor from "@coral-xyz/anchor";
import yargs from "yargs/yargs";
import os from "os";
import fs from "fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotent,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  fanoutConfigForMintKey,
  fanoutConfigKey,
  fanoutNativeAccountKey,
  init,
  membershipVoucherKey,
  membershipMintVoucherKey,
} from "@helium/hydra-sdk";
import Squads from "@sqds/sdk";
import { createAndMint, exists, sendInstructionsOrSquads } from "./utils";
import { loadKeypair } from "@switchboard-xyz/solana.js";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { sendInstructions } from "@helium/spl-utils";
import { ClockworkProvider } from "@clockwork-xyz/sdk";
import { sha256 } from "js-sha256";

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
  bucket: {
    type: "string",
    describe: "Bucket URL prefix holding all of the metadata jsons",
    default:
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib",
  },
});

async function run() {
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
    provider.wallet
  );
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }

  const state = JSON.parse(fs.readFileSync(argv.state).toString());
  const accounts = state.accounts as Record<string, any>;
  const hnt = new PublicKey(argv.hnt);
  const hst = hstKeypair.publicKey;
  const hydraProgram = await init(provider);

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
  });

  const [fanoutConfig, bumpSeed] = fanoutConfigKey(argv.name);
  const [fanoutConfigForMint, fanoutForMintBumpSeed] = fanoutConfigForMintKey(
    fanoutConfig,
    hnt
  );
  const [fanoutNativeAccount, nativeAccountBumpSeed] =
    fanoutNativeAccountKey(fanoutConfig);

  const hntAccount = await getAssociatedTokenAddressSync(
    hnt,
    fanoutConfig,
    true
  );
  console.log("Outputting hnt to", hntAccount.toBase58());
  if (!(await exists(provider.connection, fanoutConfig))) {
    const parentInstr = await hydraProgram.methods
      .processInit(
        {
          bumpSeed,
          name: argv.name,
          nativeAccountBumpSeed,
          totalShares: totalHst,
        },
        {
          token: {},
        }
      )
      .accounts({
        authority,
        fanout: fanoutConfig,
        membershipMint: hst,
      })
      .instruction();

    const initForMintInstr = await hydraProgram.methods
      .processInitForMint(fanoutForMintBumpSeed)
      .accounts({
        authority,
        fanout: fanoutConfig,
        mint: hnt,
        mintHoldingAccount: hntAccount,
      })
      .instruction();

    const instructions = [
      parentInstr,
      createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        hntAccount,
        fanoutConfig,
        hnt
      ),
      initForMintInstr,
    ];

    await sendInstructionsOrSquads({
      provider,
      instructions,
      executeTransaction: true,
      squads,
      multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
      authorityIndex: argv.authorityIndex,
      signers: [],
    });
  }

  const clockworkProvider = new ClockworkProvider(
    provider.wallet,
    provider.connection
  );
  const myHstAcct = getAssociatedTokenAddressSync(
    hst,
    provider.wallet.publicKey
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
    const [voucher] = membershipVoucherKey(fanoutConfig, solAddress);
    const memberStakeAccount = await getAssociatedTokenAddressSync(
      hst,
      voucher,
      true
    );
    if (!(await exists(provider.connection, voucher))) {
      await hydraProgram.methods
        .processSetForTokenMemberStake(hstAmount)
        .preInstructions([
          await createAssociatedTokenAccountIdempotentInstruction(
            provider.wallet.publicKey,
            memberStakeAccount,
            voucher,
            hst
          ),
        ])
        .accounts({
          authority: provider.wallet.publicKey,
          member: solAddress,
          fanout: fanoutConfig,
          membershipMint: hst,
          membershipMintTokenAccount: myHstAcct,
          memberStakeAccount,
        })
        .rpc({ skipPreflight: true });
    }

    // 2️⃣  Define a trigger condition.
    const trigger = {
      cron: {
        schedule: "0 0 30 * * * *",
        skippable: true,
      },
    };

    // 3️⃣ Create the thread.
    const threadId = `${argv.name}-${solAddress.toBase58().slice(0, 8)}`;
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

    const distributeIx = await hydraProgram.methods
      .processDistributeToken(true)
      .accounts({
        payer: new PublicKey("C1ockworkPayer11111111111111111111111111111"),
        member: solAddress,
        fanout: fanoutConfig,
        holdingAccount: hntAccount,
        fanoutForMint: fanoutConfigForMint,
        fanoutMint: hnt,
        fanoutMintMemberTokenAccount: memberHntAccount,
        memberStakeAccount: memberStakeAccount,
        membershipMint: hst,
        fanoutForMintMembershipVoucher: membershipMintVoucherKey(
          fanoutConfigForMint,
          solAddress,
          hnt
        )[0],
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

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());

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
