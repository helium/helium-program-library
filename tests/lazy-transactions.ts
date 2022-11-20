import { createAtaAndMint, createMint, sendInstructions } from "@helium/spl-utils";
import { SystemProgram } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { expect } from "chai";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  init,
  compile,
  lazyTransactionsKey,
  PROGRAM_ID,
  lazySignerKey,
} from "../packages/lazy-transactions-sdk/src";
import { LazyTransactions } from "../target/types/lazy_transactions";
import { random } from "./utils/string";

describe("lazy-transactions", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let program: Program<LazyTransactions>;

  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.LazyTransactions.idl
    );
  });

  it("loads and executes transactions", async () => {
    const name = random();
    const lazyTransactions = lazyTransactionsKey(name)[0];
    const lazySigner = lazySignerKey(name)[0];
    // to pay for my ata
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: lazySigner,
        lamports: 500000000000,
      }),
    ]);

    const mint = await createMint(provider, 0, me, me);
    const lazySignerAta = await createAtaAndMint(
      provider,
      mint,
      10,
      lazySigner
    );
    const myAta = await getAssociatedTokenAddress(mint, me);

    // Transfer some tokens from lazy signer to me
    const instructions = [
      createAssociatedTokenAccountInstruction(lazySigner, myAta, me, mint),
      createTransferInstruction(lazySignerAta, myAta, lazySigner, 10),
    ];

    // Execute instructions via lazy transactions
    const { merkleTree, compiledTransactions } = compile(lazySigner, [
      instructions,
      instructions
    ]);
    await program.methods
      .initializeLazyTransactionsV0({
        root: merkleTree.getRoot().toJSON().data,
        name,
      })
      .rpc({ skipPreflight: true });
  
    /// Ensure we fail if you execute the wrong tx
    try {
      const bogus = [
        createAssociatedTokenAccountInstruction(lazySigner, myAta, me, mint),
        createTransferInstruction(lazySignerAta, myAta, lazySigner, 1000),
      ];
      const { compiledTransactions } = compile(lazySigner, [
        bogus,
      ]);
      await program.methods
        .executeTransactionV0({
          proof: merkleTree.getProof(0).proof.map((p) => p.toJSON().data),
          instructions: compiledTransactions[0].instructions,
          index: compiledTransactions[0].index,
        })
        .accounts({ lazyTransactions })
        .remainingAccounts(compiledTransactions[0].accounts)
        .rpc({ skipPreflight: true });

      throw new Error("Should have failed");
    } catch (e: any) {
      expect(e.toString()).to.not.include("Should have failed");
    }

    await program.methods
      .executeTransactionV0({
        proof: merkleTree.getProof(0).proof.map((p) => p.toJSON().data),
        instructions: compiledTransactions[0].instructions,
        index: compiledTransactions[0].index,
      })
      .accounts({ lazyTransactions })
      .remainingAccounts(compiledTransactions[0].accounts)
      .rpc();

    /// Ensure we fail executing the same tx twice
    try {
      await program.methods
        .executeTransactionV0({
          proof: merkleTree.getProof(0).proof.map((p) => p.toJSON().data),
          instructions: compiledTransactions[0].instructions,
          index: compiledTransactions[0].index,
        })
        .accounts({ lazyTransactions })
        .remainingAccounts(compiledTransactions[0].accounts)
        .rpc({ skipPreflight: true });

      throw new Error("Should have failed");
    } catch (e: any) {
      expect(e.toString()).to.not.include("Should have failed");
    }
  });
});
