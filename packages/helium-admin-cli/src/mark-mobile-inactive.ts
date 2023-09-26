import * as anchor from "@coral-xyz/anchor";
import { init as initHem } from "@helium/helium-entity-manager-sdk";
import {
  ConfirmedSignatureInfo,
  Connection,
  PublicKey
} from "@solana/web3.js";
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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const heliumEntityManagerProgram = await initHem(provider);
  const connection = new Connection(
    provider.connection.rpcEndpoint,
    "confirmed"
  );
  const coder = new anchor.BorshCoder(heliumEntityManagerProgram.idl);
  const rewardableEntityConfig = new PublicKey(
    "EP1FNydbuKjGopwXVrVLR71NnC9YMRbTg9aHfk3KfMRj"
  );
  const sigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined = undefined;
  while (true) {
    const newSigs = await connection.getSignaturesForAddress(
     rewardableEntityConfig,
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

  for (const sig of sigs) {
    const tx = await connection.getTransaction(sig.signature);
    if (tx?.meta?.err || !tx) {
      continue;
    }
    // Should have been before this
    if (tx.blockTime && tx.blockTime < 1682902861) {
      break;
    }
    for (const instruction of (
      tx?.transaction.message.instructions || []
    ).filter((ix) =>
      tx.transaction.message.accountKeys[ix.programIdIndex].equals(
        heliumEntityManagerProgram.programId
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
      if (ix.name !== "onboardMobileHotspotV0") {
        continue;
      }

      // @ts-ignore
      if ((ix.data.args.epoch as anchor.BN).eq(new anchor.BN())) {
        continue;
      }
      const infoKey = formatted?.accounts.find(
        (a) => a.name === "Mobile Info"
      )?.pubkey;
      const subDao = formatted?.accounts.find(
        (a) => a.name === "Sub Dao"
      )?.pubkey;
      if (!subDao || !infoKey) {
        throw new Error("Info key or position missing");
      }
      const mobileInfo = await heliumEntityManagerProgram.account.mobileHotspotInfoV0.fetch(infoKey)
      console.log(`Setting ${infoKey.toBase58()} to inactive`)
      await heliumEntityManagerProgram.methods
        .setEntityActiveV0({
          isActive: false,
          entityKey: mobileInfo.entityKey,
        })
        .accounts({
          activeDeviceAuthority: provider.wallet.publicKey,
          rewardableEntityConfig,
          info: infoKey!,
        })
        .rpc({ skipPreflight: true });
    }
  }
}
