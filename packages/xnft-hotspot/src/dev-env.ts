import { PublicKey } from "@solana/web3.js";
import * as ld from "@helium-foundation/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { createMint, createNft } from "@helium-foundation/spl-utils";
import { LazyDistributor } from "@helium-foundation/idls/lib/types/lazy_distributor";

async function initLazyDistributor(
  program: anchor.Program<LazyDistributor>, 
  me: PublicKey, 
  rewardsMint: PublicKey
) {
  const method = program.methods.initializeLazyDistributorV0({
    authority: me,
    oracles: [
      {
        oracle: me,
        url: "https://some-url/",
      },
    ],
  }).accounts({
    rewardsMint
  });
  const { lazyDistributor } = await method.pubkeys();
  await method.rpc({ skipPreflight: true });
  return lazyDistributor;
}

async function initRecipient(
  program: anchor.Program<LazyDistributor>, 
  lazyDistributor: PublicKey, 
  hotspotMint: PublicKey
) {
  const method = await program.methods.initializeRecipientV0().accounts({
    lazyDistributor,
    mint: hotspotMint
  });
  await method.rpc({ skipPreflight: true });
  const recipient = (await method.pubkeys()).recipient!;
  return recipient;
}

async function setRewards(
  program: anchor.Program<LazyDistributor>, 
  lazyDistributor: PublicKey, 
  recipient: PublicKey,
) {
  await program.methods
    .setCurrentRewardsV0({
      currentRewards: new anchor.BN("5000000"),
      oracleIndex: 0,
    })
    .accounts({
      lazyDistributor,
      recipient,
    })
    .rpc({ skipPreflight: true });
}

async function setupLocalhost() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = await ld.init(provider);
  const me = provider.wallet.publicKey;

  const rewardsMint = await createMint(provider, 8, me, me);

  const lazyDistributor = await initLazyDistributor(program, me, rewardsMint);

  const { mintKey: hotspotMint } = await createNft(provider, me);
  const recipient = await initRecipient(program, lazyDistributor!, hotspotMint);

  await setRewards(program, lazyDistributor!, recipient);
}
setupLocalhost();