import { LazyDistributor } from "@helium-foundation/idls/lib/types/lazy_distributor";
import * as ld from "@helium-foundation/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { createMint, createNft, createAtaAndMint, toBN } from "@helium-foundation/spl-utils";
import { LazyDistributor } from "@helium-foundation/idls/lib/types/lazy_distributor";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as MPL_PID
} from "@metaplex-foundation/mpl-token-metadata";
import fs from 'fs';
import * as dc from "@helium-foundation/data-credits-sdk";
import {
  ThresholdType
} from "@helium-foundation/circuit-breaker-sdk";

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
    rewardsMint,
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
  const method = program.methods.initializeRecipientV0().accounts({
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

async function createTokenMetadata(provider: anchor.AnchorProvider, mintKeypair: Keypair) {
  const metadata = PublicKey.findProgramAddressSync([
    Buffer.from("metadata", "utf-8"), MPL_PID.toBuffer(), mintKeypair.publicKey.toBuffer()
    ],
    MPL_PID
  )[0];
  const instruction = createCreateMetadataAccountV3Instruction(
    {
      metadata,
      mint: mintKeypair.publicKey,
      mintAuthority: provider.wallet.publicKey,
      payer: provider.wallet.publicKey,
      updateAuthority: provider.wallet.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: "Mobile",
          symbol: "MOBILE",
          uri: "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/mobile.json",
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null
        },
        isMutable: true,
        collectionDetails: null,
      },
    }
  )
  const tx = new Transaction().add(instruction);
  provider.sendAndConfirm(tx);
}

async function initDc(provider: anchor.AnchorProvider) {
  const me = provider.wallet.publicKey;
  const dcMintKeypair = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync("/home/thornton/.config/solana/dc-mint.json").toString())
    )
  );
  const program = await dc.init(provider);
  const decimals = 8;
  const hntMint = await createMint(provider, decimals, me, me);
  const dcMint = await createMint(provider, decimals, me, me, dcMintKeypair);
  console.log("dc mint key: ", dcMint.toString());
  await createAtaAndMint(
    provider,
    hntMint,
    toBN(100, decimals).toNumber(),
    me
  );
  await createAtaAndMint(
    provider,
    dcMint,
    toBN(100, decimals).toNumber(),
    me
  );
  const method = program.methods
    .initializeDataCreditsV0({ 
      authority: me,
      config: {
        windowSizeSeconds: new anchor.BN(60),
        thresholdType: ThresholdType.Absolute as never,
        threshold: new anchor.BN("10000000000000000000")
      }
    })
    .accounts({ hntMint, dcMint, payer: me });
  await method.rpc({
    skipPreflight: true
  });
}

async function setupLocalhost() {
  
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  /**Init LD */
  const program = await ld.init(provider);
  const me = provider.wallet.publicKey;

  const rwdMintKeypair = Keypair.generate();
  console.log(rwdMintKeypair.publicKey.toString());
  const rewardsMint = await createMint(provider, 8, me, me, rwdMintKeypair);
  await createTokenMetadata(provider, rwdMintKeypair);

  const lazyDistributor = await initLazyDistributor(program, me, rewardsMint);

  const { mintKey: hotspotMint } = await createNft(provider, me, {uri: 'https://shdw-drive.genesysgo.net/CYPATLeMUuCkqBuREw1gYdfckZitf2rjMH4EqfTCMPJJ/hotspot.json'});
  const recipient = await initRecipient(program, lazyDistributor!, hotspotMint);

  await setRewards(program, lazyDistributor!, recipient);

  /**Init DC */
  await initDc(provider);
}
setupLocalhost();