import * as anchor from "@coral-xyz/anchor";
import {
  fanoutConfigForMintKey,
  fanoutConfigKey,
  init,
  membershipVoucherKey,
  membershipMintVoucherKey,
} from "@helium/hydra-sdk";
import { sendInstructions } from "@helium/spl-utils";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";

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
  name: {
    type: "string",
    describe: "Name of the fanout",
    required: true,
  },
  mint: {
    type: "string",
    describe: "Mint to dist",
    required: true,
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const hydraProgram = await init(provider);
  const fanoutK = fanoutConfigKey(argv.name)[0];
  const fanout = await hydraProgram.account.fanout.fetch(fanoutK);
  const hst = fanout.membershipMint;
  const hnt = new PublicKey(argv.mint);
  const hntAccount = getAssociatedTokenAddressSync(hnt, fanoutK, true);
  const members = (
    await hydraProgram.account.fanoutMembershipVoucher.all()
  ).filter((m) => m.account.fanout.equals(fanoutK));

  for (const member of members) {
    const solAddress = member.account.membershipKey;
    const [voucher] = membershipVoucherKey(fanoutK, solAddress);

    const memberHntAccount = await getAssociatedTokenAddressSync(
      hnt,
      solAddress,
      true
    );
    const memberHstAccount = await getAssociatedTokenAddressSync(
      hst,
      solAddress,
      true
    );
    await sendInstructions(provider, [
      createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        memberHntAccount,
        solAddress,
        hnt
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        memberHstAccount,
        solAddress,
        hst
      ),
    ]);

    const memberStakeAccount = await getAssociatedTokenAddressSync(
      hst,
      voucher,
      true
    );

    const acct = await getAccount(provider.connection, memberStakeAccount);
    if (acct.amount > 0) {
      const fanoutForMint = fanoutConfigForMintKey(fanoutK, hnt)[0];
      await hydraProgram.methods
        .processDistributeToken(true)
        .accounts({
          payer: provider.wallet.publicKey,
          member: solAddress,
          fanout: fanoutK,
          holdingAccount: hntAccount,
          fanoutForMint,
          fanoutMint: hnt,
          fanoutMintMemberTokenAccount: memberHntAccount,
          memberStakeAccount,
          membershipMint: hst,
          fanoutForMintMembershipVoucher: membershipMintVoucherKey(
            fanoutForMint,
            solAddress,
            hnt
          )[0],
        })
        .rpc({ skipPreflight: true });
    }
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
