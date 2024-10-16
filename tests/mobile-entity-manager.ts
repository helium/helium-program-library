import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { init as initDataCredits } from '@helium/data-credits-sdk';
import { init as initHeliumSubDaos } from '@helium/helium-sub-daos-sdk';
import {
  SystemProgram,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import chai from 'chai';
import { init as initMobileEntityManager } from '../packages/mobile-entity-manager-sdk/src';
import { init as initHeliumEntityManager, keyToAssetKey } from '../packages/helium-entity-manager-sdk/src';
import { DataCredits } from '../target/types/data_credits';
import { HeliumSubDaos } from '../target/types/helium_sub_daos';
import { MobileEntityManager } from '../target/types/mobile_entity_manager';
import { initTestDao, initTestSubdao } from './utils/daos';
import {
  ensureMemIdl,
  ensureDCIdl,
  ensureHSDIdl,
  initTestDataCredits,
} from './utils/fixtures';
const { expect } = chai;
import chaiAsPromised from 'chai-as-promised';
import { getAccount } from '@solana/spl-token';
import { random } from './utils/string';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from '@solana/spl-account-compression';
import { HeliumEntityManager } from '../target/types/helium_entity_manager';

chai.use(chaiAsPromised);

describe('mobile-entity-manager', () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;
  let memProgram: Program<MobileEntityManager>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let dao: PublicKey;
  let subDao: PublicKey;
  let dcMint: PublicKey;
  let programApproval: PublicKey;

  beforeEach(async () => {
    dcProgram = await initDataCredits(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );

    ensureDCIdl(dcProgram);

    hsdProgram = await initHeliumSubDaos(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );

    ensureHSDIdl(hsdProgram);

    hemProgram = await initHeliumEntityManager(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );

    memProgram = await initMobileEntityManager(
      provider,
      anchor.workspace.MobileEntityManager.programId,
      anchor.workspace.MobileEntityManager.idl
    );
    ensureMemIdl(memProgram);

    const dataCredits = await initTestDataCredits(dcProgram, provider);
    dcMint = dataCredits.dcMint;
    ({ dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dataCredits.dcMint
    ));
    ({ subDao } = await initTestSubdao({
      hsdProgram,
      provider,
      authority: me,
      dao,
      numTokens: new anchor.BN("500000000000000")
    }));

    const approve = await hemProgram.methods
      .approveProgramV0({
        programId: memProgram.programId,
      })
      .accounts({ dao });

    programApproval = (await approve.pubkeys()).programApproval!;
    await approve.rpc({ skipPreflight: true });
  });

  it('should initialize a carrier', async () => {
    const name = random();
    const {
      pubkeys: { carrier, escrow },
    } = await memProgram.methods
      .initializeCarrierV0({
        name,
        issuingAuthority: me,
        updateAuthority: me,
        hexboostAuthority: me,
        metadataUrl: "https://some/url",
        incentiveEscrowFundBps: 100,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accounts({
        subDao,
      })
      .rpcAndKeys({ skipPreflight: true });

    const carrierAcc = await memProgram.account.carrierV0.fetch(carrier!);

    expect(carrierAcc.incentiveEscrowFundBps).to.eq(100);
    expect(carrierAcc.issuingAuthority.toBase58()).to.eq(me.toBase58());
    expect(carrierAcc.updateAuthority.toBase58()).to.eq(me.toBase58());
    expect(carrierAcc.name).to.eq(name);
    expect(carrierAcc.approved).to.be.false;

    const escrowAcc = await getAccount(provider.connection, escrow!);
    expect(escrowAcc.amount.toString()).to.eq('500000000000000');
  });

  describe('with a carrier', async () => {
    let carrier: PublicKey;
    let merkle: Keypair;
    beforeEach(async () => {
      const name = random();
      console.log("carrier name", name)
      const {
        pubkeys: { carrier: carrierK },
      } = await memProgram.methods
        .initializeCarrierV0({
          name,
          issuingAuthority: me,
          updateAuthority: me,
          hexboostAuthority: me,
          metadataUrl: "https://some/url",
          incentiveEscrowFundBps: 100,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accounts({
          subDao,
        })
        .rpcAndKeys({ skipPreflight: true });
      carrier = carrierK!;
      merkle = Keypair.generate();
      // Testing -- small tree
      const space = getConcurrentMerkleTreeAccountSize(3, 8);
      const createMerkle = SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: merkle.publicKey,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          space
        ),
        space: space,
        programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      });
      await memProgram.methods
        .updateCarrierTreeV0({
          maxDepth: 3,
          maxBufferSize: 8,
        })
        .accounts({ carrier, newMerkleTree: merkle.publicKey })
        .preInstructions([createMerkle])
        .signers([merkle])
        .rpc({ skipPreflight: true });
    });

    it('allows the subdao to approve and revoke the carrier', async () => {
      await memProgram.methods
        .approveCarrierV0()
        .accounts({ carrier })
        .rpc({ skipPreflight: true });
      let carrierAcc = await memProgram.account.carrierV0.fetch(carrier!);
      expect(carrierAcc.approved).to.be.true;

      await memProgram.methods
        .revokeCarrierV0()
        .accounts({ carrier })
        .rpc({ skipPreflight: true });
      carrierAcc = await memProgram.account.carrierV0.fetch(carrier!);
      expect(carrierAcc.approved).to.be.false;
    });

    it('allows the carrier to issue itself a rewardable NFT', async () => {
      await memProgram.methods
        .issueCarrierNftV0({
          metadataUrl: null,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accounts({ carrier })
        .rpc({ skipPreflight: true });
      // No further assertions since we don't have the digital asset api in testing
    });

    describe('with carrier approval', async () => {
      beforeEach(async () => {
        await memProgram.methods
          .approveCarrierV0()
          .accounts({ carrier })
          .rpc({ skipPreflight: true });
      });

      it('allows the carrier to initialize subscribers', async () => {
        const name = random();
        await memProgram.methods
          .initializeSubscriberV0({
            entityKey: Buffer.from(name, 'utf-8'),
            metadataUrl: null,
            name,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
          ])
          .accounts({ carrier, recipient: me })
          .rpc({ skipPreflight: true });
      });

      it("allows the carrier to initialize and update incentive programs", async () => {
        const name = random();
        const { pubkeys: { incentiveEscrowProgram } } = await memProgram.methods
          .initializeIncentiveProgramV0({
            metadataUrl: null,
            name,
            startTs: new BN(5),
            stopTs: new BN(10),
            shares: 100,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
          ])
          .accounts({
            carrier,
            recipient: me,
            keyToAsset: keyToAssetKey(dao, name, "utf-8")[0],
          })
          .rpcAndKeys({ skipPreflight: true });
          const incentiveEscrowProgramAcc =
            await memProgram.account.incentiveEscrowProgramV0.fetch(
              incentiveEscrowProgram!
            );
          expect(incentiveEscrowProgramAcc.carrier.toBase58()).to.eq(carrier.toBase58());
          expect(incentiveEscrowProgramAcc.startTs.toNumber()).to.eq(5);
          expect(incentiveEscrowProgramAcc.stopTs.toNumber()).to.eq(10);
          expect(incentiveEscrowProgramAcc.shares).to.eq(100);

          await memProgram.methods.updateIncentiveProgramV0({
            startTs: new BN(10),
            stopTs: new BN(15),
            shares: 200,
          }).accounts({ incentiveEscrowProgram }).rpc({ skipPreflight: true });
          const incentiveEscrowProgramAcc2 =
            await memProgram.account.incentiveEscrowProgramV0.fetch(
              incentiveEscrowProgram!
            );
          
          expect(incentiveEscrowProgramAcc2.startTs.toNumber()).to.eq(10);
          expect(incentiveEscrowProgramAcc2.stopTs.toNumber()).to.eq(15);
          expect(incentiveEscrowProgramAcc2.shares).to.eq(200);
      });

      it("can swap tree when it's full", async () => {
        // fill up the tree
        while (true) {
          try {
            const name = random();
            await memProgram.methods
              .initializeSubscriberV0({
                entityKey: Buffer.from(name, 'utf-8'),
                metadataUrl: null,
                name,
              })
              .preInstructions([
                ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
              ])
              .accounts({ carrier, recipient: me })
              .rpc({ skipPreflight: true });
          } catch (err) {
            console.error(err);
            break;
          }
        }

        const newMerkle = Keypair.generate();
        const space = getConcurrentMerkleTreeAccountSize(3, 8);
        const createMerkle = SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: newMerkle.publicKey,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
            space
          ),
          space: space,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        });
        await memProgram.methods
          .updateCarrierTreeV0({
            maxDepth: 3,
            maxBufferSize: 8,
          })
          .accounts({ carrier, newMerkleTree: newMerkle.publicKey })
          .preInstructions([createMerkle])
          .signers([newMerkle])
          .rpc();
      })
    });
  });
});
