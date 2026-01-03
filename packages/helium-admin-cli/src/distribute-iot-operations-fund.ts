import * as anchor from '@coral-xyz/anchor';
import * as client from '@helium/distributor-oracle';
import {
  init as initHem,
  keyToAssetKey,
} from '@helium/helium-entity-manager-sdk';
import {
  init as initLazy,
  lazyDistributorKey,
  recipientKey,
} from '@helium/lazy-distributor-sdk';
import { init as initRewards } from '@helium/rewards-oracle-sdk';
import { daoKey } from '@helium/helium-sub-daos-sdk';
import { HNT_MINT, IOT_MINT, sendAndConfirmWithRetry } from '@helium/spl-utils';
import { PublicKey } from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';
import BN from 'bn.js';

const IOT_OPERATIONS_FUND = 'iot_operations_fund';

const MAX_CLAIM_AMOUNT = new BN('207020547945205');

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

  const [recipient] = recipientKey(lazyDistributor, assetId);
  if (!(await provider.connection.getAccountInfo(recipient))) {
    const method = lazyProgram.methods.initializeRecipientV0().accountsPartial({
      lazyDistributor,
      mint: assetId,
    });

    await method.rpc({ skipPreflight: true });
  }

  const rewards = await client.getCurrentRewards(
    lazyProgram,
    lazyDistributor,
    assetId
  );
  const pending = await client.getPendingRewards(
    lazyProgram,
    lazyDistributor,
    daoKey(HNT_MINT)[0],
    [IOT_OPERATIONS_FUND],
    'utf8'
  );
  // Avoid claiming too much and tripping the breaker
  if (new BN(pending[IOT_OPERATIONS_FUND]).gt(MAX_CLAIM_AMOUNT)) {
    rewards[0].currentRewards = new BN(rewards[0].currentRewards)
      .sub(new BN(pending[IOT_OPERATIONS_FUND]))
      .add(MAX_CLAIM_AMOUNT)
      .toString();
  }

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
    Buffer.from(signed.serialize()),
    { skipPreflight: true },
    'confirmed'
  );
}
