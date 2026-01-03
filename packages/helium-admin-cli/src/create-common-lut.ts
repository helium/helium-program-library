import * as anchor from "@coral-xyz/anchor";
import { chunks, sendInstructions, truthy, withPriorityFees } from "@helium/spl-utils";
import {
  AddressLookupTableProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import * as multisig from '@sqds/multisig';
import { sendInstructionsOrSquadsV4 } from "./utils";

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
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }

  const accounts = [
    // Programs
    "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
    "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR",
    "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT",
    "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8",
    "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g",
    "treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5",
    "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h",
    "porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy",
    "rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF",
    "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8",
    "fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6",
    "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr",
    "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ",
    "noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv",
    "cnvEguKeWyyWnKxoQ9HwrzEVfztqKjwNmerDvxdHK9w",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "11111111111111111111111111111111",
    // Lazy distributor IOT
    "37eiz5KzYwpAdLgrSh8GT1isKiJ6hcE5ET86dqaoCugL",
    // Lazy dist Oracle
    "orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q",
    // Oracle signer
    "7WuVr8SGcZ4KxpHBEdRGVTeSwkhk1WGUXT7DEzvWpYu4",
    // Lazy dist mobile
    "GZtTp3AUo2AHdQe9BCJ6gXR9KqfruRvHnZ4QiJUALMcz",
    // Hnt pyth
    "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33",
    // Mobile pyth
    "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx",
    // Usdc pyth
    "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD",
    // Hnt
    "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    // dc
    "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm",
    // Mobile
    "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
    // Dao
    "BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie",
    // Mobile subdao
    "Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22",
    // Iot subdao
    "39Lw1RH6zt8AJvKn3BTxmUDofzduCM2J3kSaGDZ8L7Sk",
    // Mobile Delegator pool
    "71Y96vbVWYkoVQUgVsd8LSBRRDrgp5pf1sKznM5KuaA7",
    // Mobile Delegator pool circuit breaker
    "2cocTPZ7aRT62wTDGkosF98oo4iqCtkZnFdNHWqNZLuS",
    // Iot delegator pool
    "6fvj6rSwTeCkY7i45jYZYpZEhKmPRSTmA29hUDiMSFtU",
    // Iot delegator pool circuit breaker
    "6mNUqFAyLBkV88Nj6ctrcv66iJMHwzNzV8XFUwLmGerG",
    // Mobile rewardable entity config
    "EP1FNydbuKjGopwXVrVLR71NnC9YMRbTg9aHfk3KfMRj",
    // Compression proram
    "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
    // Mobile escrow circuit breaker
    "4qGj88CX3McdTXEviEaqeP2pnZJxRTsZFWyU3Mrnbku4",
    // Mobile escrow
    "GD37bnQdGkDsjNqnVGr9qWTnQJSKMHbsiXX9tXLMUcaL",
    // Iot escrow
    "4po3YMfioHkNP4mL4N46UWJvBoQDS2HFjzGm1ifrUWuZ",
    // Iot escrow circuit breaker
    "5veMSa4ks66zydSaKSPMhV7H2eF88HvuKDArScNH9jaG",
    // Hnt registrar
    "BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz",
    // Data credits
    "D1LbvrJQ9K2WbGPMbM3Fnrf5PSsDH1TDpjqJdHuvs81n",
    // HNT Proposal Config
    "22SWTDZVj1L81SXfwbEeUmdZBFj23MFmER3Gv8BmxbBS",
    // HNT state controller
    "7Vrme34DXPH8ow4HEAatZKwZF9AR5vq8MZhA3CanMEbr",
    // IOT proposal config
    "7cvYwyj6k4NEPNoaCTUufDdGJqqB6ZBRf4t3TrSSUGrc",
    // IOT State controller
    "3eEnmZBiJems6ipPtdQS2UkJYfPqzvnDzhWQuTTN2ou5",
    // IOT Registrar
    "7ZZopN1mx6ECcb3YCG8dbxeLpA44xq4gzA1ETEiaLoeL",
    // State controller program
    "stcfiqW3fwD9QCd8Bqr1NBLrs7dftZHBQe7RiMMA4aM",
    // Mobile proposal config
    "5c9JxRCj4CwhZwaUyjvpb4JJbKW7xpvEFq3Rb2upkytc",
    // Mobile registrar
    "C4DWaps9bLiqy4e81wJ7VTQ6QR7C4MWvwsei3ZjsaDuW",
    // Mobile state controller
    "r11HAkEaPqkFHwDVewcmWSfRrMaLYcBLGquC2RBn3Xp",
    // Proposal config
    "22SWTDZVj1L81SXfwbEeUmdZBFj23MFmER3Gv8BmxbBS",
    // Vote controller
    "7Vrme34DXPH8ow4HEAatZKwZF9AR5vq8MZhA3CanMEbr",
    // State controller
    "stcfiqW3fwD9QCd8Bqr1NBLrs7dftZHBQe7RiMMA4aM",
    // Task queue
    "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
    // Task Queue Authority
    "31ZbFYvxvjMkW8efhKPxuqnKMuu9G8a9w7UsLJ3nNBCk",
    // HPL Crons
    "hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu",
    // Tuktuk
    "tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA",
  ].map((a) => {
    return new PublicKey(a);
  });

  const slot = await provider.connection.getSlot();
  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority,
      payer: authority,
      recentSlot: slot,
    });
  let isFirst = true;
  for (const addresses of chunks(accounts, 20)) {
    await sendInstructionsOrSquadsV4({
      provider,
      signers: [],
      multisig: multisigPda!,
      instructions: await withPriorityFees({
        connection: provider.connection,
        computeUnits: 200000,
        instructions: [
          isFirst ? lookupTableInst : undefined,
          AddressLookupTableProgram.extendLookupTable({
            payer: authority,
            authority,
            lookupTable: lookupTableAddress,
            addresses: addresses,
          }),
        ].filter(truthy),
      }),
    });
    isFirst = false;
  }
  console.log("lookup table address:", lookupTableAddress.toBase58());
}
