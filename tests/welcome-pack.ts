import * as anchor from "@coral-xyz/anchor"
import { Program } from "@coral-xyz/anchor"
import { Keypair as HeliumKeypair } from "@helium/crypto"
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk"
import { init as initMiniFanout } from "@helium/mini-fanout-sdk"
import { bulkSendTransactions, createMint, sendInstructions, sleep, toBN } from "@helium/spl-utils"
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk"
import bs58 from "bs58"
import { init as initTuktuk, taskQueueKey, taskQueueNameMappingKey, tuktukConfigKey } from "@helium/tuktuk-sdk"
import { AddressLookupTableProgram, ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js"
import { BN } from "bn.js"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { ThresholdType } from "../packages/circuit-breaker-sdk/src"
import { initializeCompressionRecipient, init as initLazyDistributor, lazyDistributorKey, recipientKey } from "../packages/lazy-distributor-sdk/src"
import { miniFanoutKey, queueAuthorityKey } from "../packages/mini-fanout-sdk/src"
import { oracleSignerKey } from "../packages/rewards-oracle-sdk/src"
import { claimApprovalSignature, claimWelcomePack, closeWelcomePack, initializeWelcomePack, init as initWelcomePack, welcomePackKey } from "../packages/welcome-pack-sdk/src"
import { HeliumSubDaos } from "../target/types/helium_sub_daos"
import { LazyDistributor } from "../target/types/lazy_distributor"
import { MiniFanout } from "../target/types/mini_fanout"
import { WelcomePack } from "../target/types/welcome_pack"
import { createMockCompression } from "./utils/compression"
import { dataOnlyConfigKey, init as initHeliumEntityManager } from "../packages/helium-entity-manager-sdk/src"
import { HeliumEntityManager } from "../target/types/helium_entity_manager"
import { initTestDao, initTestSubdao } from "./utils/daos"
import { ensureHEMIdl, ensureHSDIdl, ensureLDIdl, ensureMFIdl, ensureWPIdl } from "./utils/fixtures"
import { getConcurrentMerkleTreeAccountSize, SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@solana/spl-account-compression"
import { loadKeypair } from "./utils/solana"
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token"
import { BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID } from "../packages/welcome-pack-sdk/src/functions/initializeWelcomePack"

chai.use(chaiAsPromised)
const { expect } = chai

describe("welcome-pack", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"))
  const provider = anchor.getProvider() as anchor.AnchorProvider
  const me = provider.wallet.publicKey
  const eccVerifier = loadKeypair(__dirname + "/keypairs/verifier-test.json");

  const oracle = Keypair.generate()
  let welcomePackProgram: Program<WelcomePack>
  let tuktukProgram: Program<Tuktuk>
  let hemProgram: Program<HeliumEntityManager>
  let lazyDistributorProgram: Program<LazyDistributor>
  let heliumSubDaosProgram: Program<HeliumSubDaos>
  let miniFanoutProgram: Program<MiniFanout>
  let dao: PublicKey
  let hntMint: PublicKey
  let dcMint: PublicKey
  let collection: PublicKey
  let merkle: PublicKey
  let hotspot: PublicKey
  let hotspotOwner: Keypair
  let getAssetFn: any
  let getAssetProofFn: any
  let lazyDistributor: PublicKey
  let rewardsMint: PublicKey
  let taskQueue: PublicKey
  let taskQueueName = `test-${Math.random().toString(36).substring(2, 15)}`;
  let ecc: string;

  before(async () => {
    await ensureLDIdl()
    await ensureWPIdl()
    await ensureHSDIdl()
    await ensureMFIdl()
    await ensureHEMIdl()
    heliumSubDaosProgram = await initHeliumSubDaos(provider)
    welcomePackProgram = await initWelcomePack(provider)
    miniFanoutProgram = await initMiniFanout(provider)
    lazyDistributorProgram = await initLazyDistributor(provider)
    hemProgram = await initHeliumEntityManager(provider)
    tuktukProgram = await initTuktuk(provider);
    const tuktukConfig = tuktukConfigKey()[0]
    const config = await tuktukProgram.account.tuktukConfigV0.fetch(
      tuktukConfig
    );
    const nextTaskQueueId = config.nextTaskQueueId;
    taskQueue = taskQueueKey(tuktukConfig, nextTaskQueueId)[0];

    await tuktukProgram.methods
      .initializeTaskQueueV0({
        name: taskQueueName,
        minCrankReward: new anchor.BN(1),
        capacity: 1000,
        lookupTables: [],
        staleTaskAge: 10000,
      })
      .accounts({
        tuktukConfig,
        payer: me,
        updateAuthority: me,
        taskQueue,
        taskQueueNameMapping: taskQueueNameMappingKey(tuktukConfig, taskQueueName)[0],
      })
      .rpc();

    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        payer: me,
        queueAuthority: queueAuthorityKey()[0],
        taskQueue,
      })
      .rpc();
  })

  beforeEach(async () => {
    ecc = (await HeliumKeypair.makeRandom()).address.b58;
    // Set up DAO, SubDAO, mints, and a compressed hotspot NFT
    const mint = await createMint(provider, 8, me, me)
    hntMint = mint
    dcMint = await createMint(provider, 0, me, me)
    const daoRes = await initTestDao(
      heliumSubDaosProgram,
      provider,
      100,
      me,
      dcMint,
      hntMint
    )
    dao = daoRes.dao
    await initTestSubdao({
      hsdProgram: heliumSubDaosProgram,
      provider,
      authority: me,
      dao,
      numTokens: new BN(1000000000),
    })

    // Mint a compressed hotspot NFT
    hotspotOwner = Keypair.generate()
    const merkleKeypair = Keypair.generate()
    merkle = merkleKeypair.publicKey
    const dataOnlyConfigK = dataOnlyConfigKey(dao)[0]
    collection = PublicKey.findProgramAddressSync([Buffer.from("collection"), dataOnlyConfigK.toBuffer()], hemProgram.programId)[0]

    const [height, buffer, canopy] = [3, 8, 0];
    const space = getConcurrentMerkleTreeAccountSize(height, buffer, canopy);
    const cost = await provider.connection.getMinimumBalanceForRentExemption(
      space
    );
    await hemProgram.methods
      .initializeDataOnlyV0({
        authority: me,
        newTreeDepth: height,
        newTreeBufferSize: buffer,
        newTreeSpace: new BN(
          getConcurrentMerkleTreeAccountSize(height, buffer, canopy)
        ),
        newTreeFeeLamports: new BN((LAMPORTS_PER_SOL * 30) / 2 ** height),
        name: "DATAONLY",
        metadataUrl: "test",
      })
      .accountsPartial({
        dao,
        merkleTree: merkle,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: merkle,
          lamports: cost,
          space: space,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        })
      ])
      .signers([merkleKeypair])
      .rpc({ skipPreflight: true });
    await hemProgram.methods
      .issueDataOnlyEntityV0({
        entityKey: Buffer.from(bs58.decode(ecc)),
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accountsPartial({
        recipient: hotspotOwner.publicKey,
        dao,
        eccVerifier: eccVerifier.publicKey,
      })
      .signers([eccVerifier])
      .rpc({ skipPreflight: true });

    const mock = await createMockCompression({
      collection,
      dao,
      merkle,
      ecc,
      hotspotOwner: hotspotOwner.publicKey,
    })
    hotspot = mock.hotspot
    getAssetFn = mock.getAssetFn
    getAssetProofFn = mock.getAssetProofFn

    // Initialize Lazy Distributor and Recipient
    rewardsMint = hntMint
    const [ldPda] = lazyDistributorKey(rewardsMint)
    lazyDistributor = ldPda
    await lazyDistributorProgram.methods
      .initializeLazyDistributorV0({
        authority: me,
        oracles: [
          {
            oracle: oracle.publicKey,
            url: "https://some-url/",
          },
        ],
        windowConfig: {
          windowSizeSeconds: new anchor.BN(10),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN(1000000000),
        },
        approver: oracleSignerKey()[0],
      })
      .accountsPartial({
        rewardsMint,
      })
      .rpc({ skipPreflight: true })
    await (await initializeCompressionRecipient({
      program: lazyDistributorProgram,
      assetId: hotspot,
      lazyDistributor,
      owner: hotspotOwner.publicKey,
      payer: me,
      assetEndpoint: "https://some-url/",
      getAssetFn,
      getAssetProofFn,
    })).rpc({ skipPreflight: true })
  })

  describe("with a welcome pack", () => {
    const rewardsSchedule = "* * * * * *"
    let welcomePack: PublicKey;
    beforeEach(async () => {
      const rewardsSplit = [
        {
          wallet: me,
          share: { share: { amount: 50 } },
        },
        {
          wallet: PublicKey.default,
          share: { share: { amount: 50 } },
        }
      ]
      const solAmount = toBN(0.01, 9)
      welcomePack = welcomePackKey(hotspotOwner.publicKey, 0)[0]
      console.log("Inittting welcome pack")
      const { pubkeys: { welcomePack: welcomePackPda } } = await (await initializeWelcomePack({
        program: welcomePackProgram,
        assetId: hotspot,
        lazyDistributor,
        solAmount,
        rewardsSplit,
        rewardsSchedule,
        getAssetFn,
        getAssetProofFn,
        assetReturnAddress: hotspotOwner.publicKey,
        rentRefund: PublicKey.default,
        owner: hotspotOwner.publicKey,
        payer: me,
      }))
        .signers([hotspotOwner])
        .rpcAndKeys({ skipPreflight: true })
      welcomePack = welcomePackPda!
      console.log("Welcome pack initialized")
    })

    it("claims a welcome pack", async () => {
      const claimer = Keypair.generate();
      const claimApproval = {
        uniqueId: 0,
        expirationTimestamp: new BN(Math.floor(Date.now() / 1000) + 60),
      }
      const claimSignature = claimApprovalSignature(claimApproval, hotspotOwner)
      const miniFanout = miniFanoutKey(
        welcomePack,
        hotspot.toBuffer()
      )[0]
      // TODO: Asset proof stuff
      const mock = await createMockCompression({
        collection,
        dao,
        merkle,
        ecc,
        hotspotOwner: welcomePack,
      })
      getAssetFn = mock.getAssetFn
      getAssetProofFn = mock.getAssetProofFn
      const ixs = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
        await (await claimWelcomePack({
          program: welcomePackProgram,
          tuktukProgram,
          claimApproval,
          claimApprovalSignature: claimSignature,
          claimer: claimer.publicKey,
          taskQueue,
          getAssetFn,
          getAssetProofFn,
        }))
          .instruction()
      ]
      const slot = await provider.connection.getSlot();
      const [lutIx, lut] = AddressLookupTableProgram.createLookupTable({
        authority: me,
        payer: me,
        recentSlot: slot,
      })
      await sendInstructions(provider, [lutIx, AddressLookupTableProgram.extendLookupTable({
        payer: me,
        authority: me,
        lookupTable: lut,
        addresses: [taskQueue, hntMint, ASSOCIATED_PROGRAM_ID, BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID],
      })])
      // Wait for lut to activate
      await sleep(1000)
      await bulkSendTransactions(provider, [{
        instructions: ixs,
        addressLookupTableAddresses: [lut],
        feePayer: me,
        signers: [claimer],
      }], undefined, 10, [claimer])

      // Verify mini fanout was created
      const miniFanoutAccount = await miniFanoutProgram.account.miniFanoutV0.fetch(miniFanout)
      expect(miniFanoutAccount.schedule).to.equal(rewardsSchedule)
      expect(miniFanoutAccount.shares.length).to.equal(2)
      expect(miniFanoutAccount.shares[0].wallet.toBase58()).to.equal(me.toBase58())
      expect(miniFanoutAccount.shares[0].share.share?.amount).to.equal(50)
      expect(miniFanoutAccount.shares[1].wallet.toBase58()).to.equal(claimer.publicKey.toBase58())
      expect(miniFanoutAccount.shares[1].share.share?.amount).to.equal(50)

      // Verify rewards recipient set to the fanout
      const rewardsRecipient = await lazyDistributorProgram.account.recipientV0.fetch(recipientKey(lazyDistributor, hotspot)[0])
      expect(rewardsRecipient.destination.toBase58()).to.equal(miniFanout.toBase58())
    })

    it("closes a welcome pack", async () => {
      await (await closeWelcomePack({
        program: welcomePackProgram,
        welcomePack,
        assetEndpoint: "https://some-url/",
        getAssetFn,
        getAssetProofFn,
      }))
        .signers([hotspotOwner])
        .rpc({ skipPreflight: true })

      const welcomePackAccount = await welcomePackProgram.account.welcomePackV0.fetchNullable(welcomePack)
      expect(welcomePackAccount).to.be.null
    })
  })
})
