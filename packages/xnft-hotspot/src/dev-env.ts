import { PublicKey, TransactionInstruction, Transaction, Keypair } from "@solana/web3.js";
import * as ld from "@helium-foundation/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { createMint, createNft } from "@helium-foundation/spl-utils";
import { LazyDistributor } from "@helium-foundation/idls/lib/types/lazy_distributor";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as MPL_PID,
} from "@metaplex-foundation/mpl-token-metadata";

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

async function setupLocalhost() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
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
}
setupLocalhost();