import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
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
import { init as initHeliumEntityManager } from '../packages/helium-entity-manager-sdk/src';
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
    ({ subDao } = await initTestSubdao(
      hsdProgram,
      provider,
      me,
      dao,
      undefined,
      undefined,
      new anchor.BN('500000000000000')
    ));

    await hemProgram.methods
      .approveProgramV0({
        programId: memProgram.programId,
      })
      .accounts({ dao })
      .rpc({ skipPreflight: true });
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
        metadataUrl: 'https://some/url',
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accounts({
        subDao,
      })
      .rpcAndKeys({ skipPreflight: true });

    const carrierAcc = await memProgram.account.carrierV0.fetch(carrier!);

    expect(carrierAcc.issuingAuthority.toBase58()).to.eq(me.toBase58());
    expect(carrierAcc.updateAuthority.toBase58()).to.eq(me.toBase58());
    expect(carrierAcc.name).to.eq(name);
    expect(carrierAcc.approved).to.be.false;

    const escrowAcc = await getAccount(provider.connection, escrow!);
    expect(escrowAcc.amount.toString()).to.eq('500000000000000');
  });

  describe('with a carrier', async () => {
    let carrier: PublicKey;
    beforeEach(async () => {
      const name = random();
      const {
        pubkeys: { carrier: carrierK },
      } = await memProgram.methods
        .initializeCarrierV0({
          name,
          issuingAuthority: me,
          updateAuthority: me,
          metadataUrl: 'https://some/url',
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accounts({
          subDao,
        })
        .rpcAndKeys({ skipPreflight: true });
      carrier = carrierK!;
      const merkle = Keypair.generate();
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
    });
  });
});
