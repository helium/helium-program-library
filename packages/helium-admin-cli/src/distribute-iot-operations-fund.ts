import * as anchor from '@coral-xyz/anchor';
import * as client from '@helium/distributor-oracle';
import {
  init as initHem,
  keyToAssetKey,
} from '@helium/helium-entity-manager-sdk';
import {
  init as initLazy,
  lazyDistributorKey,
} from '@helium/lazy-distributor-sdk';
import { init as initRewards } from '@helium/rewards-oracle-sdk';
import { daoKey } from '@helium/helium-sub-daos-sdk';
import { HNT_MINT, IOT_MINT, sendAndConfirmWithRetry } from '@helium/spl-utils';
import { PublicKey } from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';

const IOT_OPERATIONS_FUND = 'iot_operations_fund';

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
    mint: {
      type: 'string',
      describe: 'Pubkey of the rewards mint',
      default: IOT_MINT.toBase58(),
    },
    hntMint: {
      type: 'string',
      describe: 'Mint address of hnt',
      default: HNT_MINT.toBase58(),
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);
  const lazyProgram = await initLazy(provider);
  const rewardsOracleProgram = await initRewards(provider);

  const mint = new PublicKey(argv.mint);
  const [dao] = daoKey(new PublicKey(argv.hntMint));
  const [lazyDistributor] = lazyDistributorKey(mint);
  const [keyToAsset] = keyToAssetKey(dao, IOT_OPERATIONS_FUND, 'utf8');
  const assetId = (await hemProgram.account.keyToAssetV0.fetch(keyToAsset))
    .asset;

  const rewards = await client.getCurrentRewards(
    lazyProgram,
    lazyDistributor,
    assetId
  );

  const tx = await client.formTransaction({
    program: lazyProgram,
    rewardsOracleProgram: rewardsOracleProgram,
    provider,
    rewards,
    asset: assetId,
    lazyDistributor,
  });

  const signed = await provider.wallet.signTransaction(tx);
  await sendAndConfirmWithRetry(
    provider.connection,
    signed.serialize(),
    { skipPreflight: true },
    'confirmed'
  );
}
