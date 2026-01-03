import * as anchor from '@coral-xyz/anchor';
import Address from '@helium/address';
import { ED25519_KEY_TYPE } from '@helium/address/build/KeyTypes';
import { fanoutKey, init, membershipVoucherKey } from '@helium/fanout-sdk';
import { createMintInstructions } from '@helium/spl-utils';
import {
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import { ComputeBudgetProgram, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import yargs from 'yargs/yargs';
import { createAndMint, exists, loadKeypair } from './utils';

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: 'k',
      describe: 'Anchor wallet keypair',
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: 'u',
      default: 'http://127.0.0.1:8899',
      describe: 'The solana url',
    },
    hnt: {
      type: 'string',
      describe: 'Pubkey of hnt',
      required: true,
    },
    state: {
      type: 'string',
      alias: 's',
      default: `${__dirname}/../../migration-service/export.json`,
    },
    name: {
      type: 'string',
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to control the dao. If not provided, your wallet will be the authority',
    },
    authorityIndex: {
      type: 'number',
      describe: 'Authority index for squads. Defaults to 1',
      default: 1,
    },
    hstKeypair: {
      type: 'string',
      describe: 'Keypair of the HST token',
      default: `${__dirname}/../keypairs/hst.json`,
    },
    hstReceiptBasePath: {
      type: 'string',
      describe: 'Keypair of the HST receipt token',
      default: `${__dirname}/../keypairs`,
    },
    bucket: {
      type: 'string',
      describe: 'Bucket URL prefix holding all of the metadata jsons',
      default:
        'https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP',
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hstKeypair = loadKeypair(argv.hstKeypair);

  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
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

  const fanout = fanoutKey(argv.name!)[0];
  const hntAccount = await getAssociatedTokenAddressSync(hnt, fanout, true);
  console.log('Outputting hnt to', hntAccount.toBase58());
  if (!(await exists(provider.connection, fanout))) {
    await fanoutProgram.methods
      .initializeFanoutV0({
        name: argv.name!,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accountsPartial({
        authority,
        membershipMint: hst,
        fanoutMint: hnt,
      })
      .rpc({ skipPreflight: true });
  }

  for (const [address, account] of Object.entries(accounts)) {
    if (!account.hst || account.hst === 0 || account.hst === '0') {
      continue;
    }
    let solAddress: PublicKey | undefined = toSolana(address);
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

    const ownerActual = (
      await provider.connection.getTokenLargestAccounts(mint.publicKey)
    ).value[0]?.address;
    if (ownerActual && ownerActual.toBase58() !== solAddress.toBase58()) {
      const acc = await getAccount(provider.connection, ownerActual);
      console.log(
        'Found diff address',
        solAddress.toBase58(),
        acc.owner.toBase58()
      );
      solAddress = acc.owner;
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
        .accountsPartial({
          recipient: solAddress,
          fanout,
          mint: mint.publicKey,
        })
        .signers([mint])
        .rpc({ skipPreflight: true });
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
