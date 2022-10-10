import chai, { assert } from 'chai';
import chaiHttp from "chai-http";
import server from '../packages/distributor-oracle/src/server';
import * as client from '../packages/distributor-oracle/src/client';
import { sendInstructions, execute } from "../packages/spl-utils/src";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  Keypair, PublicKey
} from "@solana/web3.js";
import { expect } from "chai";
import { init, setCurrentRewardsInstructions, distributeRewardsInstructions, PROGRAM_ID, lazyDistributorKey, recipientKey } from "../packages/lazy-distributor-sdk/src";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { createMint, createTestNft, mintTo } from "./utils/token";
import { PROGRAM_ID as tokenMetadataProgram } from "@metaplex-foundation/mpl-token-metadata";



chai.use(chaiHttp);

describe('distributor-oracle', () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));
  let program: Program<LazyDistributor>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const oracle = Keypair.generate();
  let collectionMint: PublicKey;
  let rewardsMint: PublicKey;
  let lazyDistributor: PublicKey;
  let recipient: PublicKey;
  let mint: PublicKey;

  beforeEach(async () => {
    program = await init(provider, PROGRAM_ID, anchor.workspace.LazyDistributor.idl);
    const { mintKey: collectionKey } = await createTestNft(provider, me);

    collectionMint = collectionKey;
    rewardsMint = await createMint(provider, 6, me, me);

    // init LD
    lazyDistributor = lazyDistributorKey(collectionMint, rewardsMint)[0];
    await program.methods.initializeLazyDistributorV0({
      collection: collectionMint,
      oracles: [
        {
          oracle: oracle.publicKey,
          url: "https://some-url/",
        },
      ],
      authority: provider.wallet.publicKey,
    }).accounts({
      lazyDistributor,
      rewardsMint
    }).rpc();

    // init recipient
    const { mintKey } = await createTestNft(provider, me, collectionMint);
    mint = mintKey;
    recipient = recipientKey(lazyDistributor, mint)[0];
    await program.methods.initializeRecipientV0().accounts({
      lazyDistributor,
      recipient,
      mint,
      tokenMetadataProgram,
    }).rpc()
  });

  it('should provide the current rewards for a hotspot', (done) => {
    chai.request(server)
      .get('/?mint=daoK94GYdvRjVxkSyTxNLxtAEYZohLJqmwad8pBK261')
      .end((err, res) => {
        assert.equal(res.status, 200);
        assert.typeOf(res.body, 'object')
        done();
      });
  });

  it('should sign properly formed transactions', async () => {
    const tx = await client.formTransaction(program, provider, [{
      oracleKey: oracle.publicKey,
      currentRewards: 5,
    }], recipient)
    const serializedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false})
    const res = await chai.request(server)
      .post('/')
      .send({ transaction: serializedTx })

    
  });

  describe('Transaction validation tests', () => {
    it("doesn't sign if setRewards value is incorrect", () => {

    })

    it("doesn't sign if unauthorised instructions are included", () => {

    })

    it("doesn't sign if oracle is set as the fee payer", () => {

    })
  })

});