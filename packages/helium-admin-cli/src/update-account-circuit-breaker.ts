import * as anchor from '@coral-xyz/anchor';
import { init } from '@helium/circuit-breaker-sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { BN } from 'bn.js';
import os from 'os';
import yargs from 'yargs/yargs';
import { loadKeypair, sendInstructionsOrSquadsV4 } from './utils';

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
    circuitBreaker: {
      type: 'string',
      required: true,
      describe: 'Circuit breaker account',
    },
    windowSizeSeconds: {
      type: 'number',
    },
    threshold: {
      type: 'number',
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    newAuthority: {
      type: 'string',
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const circuitBreakerKey = new PublicKey(argv.circuitBreaker);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const circuitBreakerProgram = await init(provider);

  const instructions: TransactionInstruction[] = [];
  const circuitBreaker =
    await circuitBreakerProgram.account.accountWindowedCircuitBreakerV0.fetch(
      circuitBreakerKey
    );
  instructions.push(
    await circuitBreakerProgram.methods
      .updateAccountWindowedBreakerV0({
        newAuthority: argv.newAuthority
          ? new PublicKey(argv.newAuthority)
          : circuitBreaker.authority,
        config: {
          windowSizeSeconds: argv.windowSizeSeconds
            ? new BN(argv.windowSizeSeconds)
            : circuitBreaker.config.windowSizeSeconds,
          thresholdType: circuitBreaker.config.thresholdType,
          threshold: argv.threshold
            ? new BN(argv.threshold)
            : circuitBreaker.config.threshold,
        },
      })
      .accountsPartial({
        circuitBreaker: circuitBreakerKey,
        authority: circuitBreaker.authority,
      })
      .instruction()
  );

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
