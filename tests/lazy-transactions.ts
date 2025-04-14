import {
  createAtaAndMint,
  createMint,
  sendInstructions,
} from "@helium/spl-utils";
import { SystemProgram, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import {
  init,
  compile,
  lazyTransactionsKey,
  PROGRAM_ID,
  lazySignerKey,
  fillCanopy,
  getCanopySize,
  getBitmapLen,
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

    const mintSeeds = [Buffer.from("user", "utf-8"), Buffer.from(name, "utf-8"), Buffer.from("mint" + name, "utf-8")];
    const [mintKey, mintBump] = PublicKey.findProgramAddressSync(mintSeeds, program.programId);
    const createMintIxns = [
      SystemProgram.createAccount({
        fromPubkey: lazySigner,
        newAccountPubkey: mintKey,
        space: 82,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          82
        ),
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKey,
        0,
        me,
        me
      )
    ];
    const mintSignerSeeds = [
      ...mintSeeds,
      Buffer.from([mintBump]),
    ];
    // Execute instructions via lazy transactions
    const { merkleTree, compiledTransactions } = compile(lazySigner, [
      // Include an irrelevant signer seeds just to make sure tx succeeds with it
      { instructions, signerSeeds: [mintSignerSeeds] },
      { instructions, signerSeeds: [] },
      { instructions: createMintIxns, signerSeeds: [mintSignerSeeds] },
    ]);
    const canopy = Keypair.generate();
    const executedTransactions = Keypair.generate();
    const canopySize = getCanopySize(merkleTree.depth - 1);
    const canopyRent = await provider.connection.getMinimumBalanceForRentExemption(canopySize)
    const executedTransactionsSize = 1 + getBitmapLen(merkleTree.depth - 1);
    const executedTransactionsRent =
      await provider.connection.getMinimumBalanceForRentExemption(executedTransactionsSize);
    await program.methods
      .initializeLazyTransactionsV0({
        root: merkleTree.getRoot().toJSON().data,
        name,
        authority: me,
        maxDepth: merkleTree.depth - 1,
      })
      .accountsPartial({
        canopy: canopy.publicKey,
        executedTransactions: executedTransactions.publicKey,
      })
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: me,
          newAccountPubkey: canopy.publicKey,
          space: canopySize,
          lamports: canopyRent,
          programId: program.programId,
        }),
        SystemProgram.createAccount({
          fromPubkey: me,
          newAccountPubkey: executedTransactions.publicKey,
          space: executedTransactionsSize,
          lamports: executedTransactionsRent,
          programId: program.programId,
        }),
      ])
      .signers([canopy, executedTransactions])
      .rpc({ skipPreflight: true });
    
    await fillCanopy({
      program,
      lazyTransactions,
      merkleTree,
      cacheDepth: merkleTree.depth - 1
    });
    await sleep(2000);

    const accounts = compiledTransactions[0].accounts;

    /// Ensure we fail if you execute the wrong tx
    try {
      const bogus = [
        {
          instructions: [
            createAssociatedTokenAccountInstruction(
              lazySigner,
              myAta,
              me,
              mint
            ),
            createTransferInstruction(lazySignerAta, myAta, lazySigner, 1000),
          ],
          signerSeeds: []
        },
      ];
      const { compiledTransactions: badTransactions } = compile(lazySigner, bogus);
      await program.methods
        .executeTransactionV0({
          instructions: badTransactions[0].instructions,
          index: badTransactions[0].index,
          signerSeeds: badTransactions[0].signerSeeds,
        })
        .accountsPartial({ lazyTransactions })
        .remainingAccounts(accounts)
        .rpc({ skipPreflight: true });

      throw new Error("Should have failed");
    } catch (e: any) {
      expect(e.toString()).to.not.include("Should have failed");
    }

    // Successful tx
    await program.methods
      .executeTransactionV0({
        instructions: compiledTransactions[0].instructions,
        index: compiledTransactions[0].index,
        signerSeeds: compiledTransactions[0].signerSeeds,
      })
      .accountsPartial({ lazyTransactions })
      .remainingAccounts(accounts)
      .rpc({ skipPreflight: true });


    // Execute a tx with a pda
    await program.methods
      .executeTransactionV0({
        instructions: compiledTransactions[2].instructions,
        index: compiledTransactions[2].index,
        signerSeeds: compiledTransactions[2].signerSeeds,
      })
      .accountsPartial({ lazyTransactions })
      .remainingAccounts(compiledTransactions[2].accounts)
      .rpc({ skipPreflight: true });

    /// Ensure we fail executing the same tx twice
    try {
      await program.methods
        .executeTransactionV0({
          instructions: compiledTransactions[0].instructions,
          index: compiledTransactions[0].index,
          signerSeeds: compiledTransactions[0].signerSeeds,
        })
        .accountsPartial({ lazyTransactions })
        .remainingAccounts(accounts)
        .rpc();

      throw new Error("Should have failed");
    } catch (e: any) {
      console.log(e.toString())
      expect(e.toString()).to.include("Transaction has already been executed");
    }

    /// Attempt to close the canopy
    console.log("Closing canopy")
    await program.methods.closeCanopyV0()
      .accountsPartial({ lazyTransactions, refund: provider.wallet.publicKey })
      .rpc({ skipPreflight: true });
  });
});

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
