import {
  currentEpoch,
  daoEpochInfoKey,
  daoKey,
  EPOCH_LENGTH,
  init as initDao,
  subDaoEpochInfoKey,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import * as anchor from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  ConfirmedSignatureInfo,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { BN } from "bn.js";
import b58 from "bs58";
import os from "os";
import yargs from "yargs/yargs";
import { IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";

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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const epoch = 19624;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const heliumSubDaosProgram = await initDao(provider);
  const connection = new Connection(
    provider.connection.rpcEndpoint,
    "confirmed"
  );
  const subDaoEpochInfos = [
    subDaoEpochInfoKey(
      subDaoKey(IOT_MINT)[0],
      new BN(epoch).mul(new BN(EPOCH_LENGTH))
    )[0],
    subDaoEpochInfoKey(
      subDaoKey(MOBILE_MINT)[0],
      new BN(epoch).mul(new BN(EPOCH_LENGTH))
    )[0],
  ];
  console.log(subDaoEpochInfos);
  const coder = new anchor.BorshCoder(heliumSubDaosProgram.idl);
  for (const subDaoEpochInfo of subDaoEpochInfos) {
    const sigs: ConfirmedSignatureInfo[] = [];
    let before: string | undefined = undefined;
    while (true) {
      const newSigs = await connection.getSignaturesForAddress(
        subDaoEpochInfo,
        {
          limit: 1000,
          before,
        }
      );
      sigs.push(...newSigs);
      if (newSigs.length < 1000) {
        break;
      }
      before = newSigs[newSigs.length - 1].signature;
    }

    let foundIssue = false;
    for (const sig of sigs) {
      const tx = await connection.getTransaction(sig.signature);
      if (tx?.meta?.err || !tx) {
        continue;
      }
      // Should have been before this
      if (tx.blockTime && tx.blockTime > 1695652196) {
        continue;
      }
      for (const instruction of (
        tx?.transaction.message.instructions || []
      ).filter((ix) =>
        tx.transaction.message.accountKeys[ix.programIdIndex].equals(
          heliumSubDaosProgram.programId
        )
      )) {
        const accountMetas = instruction.accounts.map((idx) => ({
          pubkey: tx.transaction.message.accountKeys[idx],
          isSigner: tx.transaction.message.isAccountSigner(idx),
          isWritable: tx.transaction.message.isAccountWritable(idx),
        }));
        const ix = coder.instruction.decode(instruction.data, "base58");
        if (!ix) {
          continue;
        }
        const formatted = coder.instruction.format(ix, accountMetas);
        if (ix.name === "issueRewardsV0") {
          foundIssue = true;
        }
        if (!foundIssue) {
          continue;
        }

        if (ix.name !== "claimRewardsV0") {
          continue;
        }

        // @ts-ignore
        if ((ix.data.args.epoch as anchor.BN).eq(new anchor.BN())) {
          continue;
        }
        const position = formatted?.accounts.find(
          (a) => a.name === "Position"
        )?.pubkey;
        const subDao = formatted?.accounts.find(
          (a) => a.name === "Sub Dao"
        )?.pubkey;
        if (!subDao || !position) {
          throw new Error("Subdao or position missing");
        }
        const method = heliumSubDaosProgram.methods
          .tempClaimFailedClaims()
          .accounts({
            authority: provider.wallet.publicKey,
            position,
            subDao,
            subDaoEpochInfo,
          });
        const { block } = await method.pubkeys();
        if (!(await connection.getAccountInfo(block!))) {
          console.log("Repairing", position.toBase58());
          await method.rpc({
            skipPreflight: true,
          });
        }
      }
    }
  }
}
