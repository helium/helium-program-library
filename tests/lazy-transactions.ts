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
  ixToBin,
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

    const mintSeeds = [
      Buffer.from("user", "utf-8"),
      Buffer.from(name, "utf-8"),
      Buffer.from("mint" + name, "utf-8"),
    ];
    const [mintKey, mintBump] = PublicKey.findProgramAddressSync(
      mintSeeds,
      program.programId
    );
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
      createInitializeMintInstruction(mintKey, 0, me, me),
    ];
    const mintSignerSeeds = [...mintSeeds, Buffer.from([mintBump])];
    // Execute instructions via lazy transactions
    const { merkleTree, compiledTransactions } = compile(lazySigner, [
      { instructions, signerSeeds: [] },
      { instructions, signerSeeds: [] },
      { instructions: createMintIxns, signerSeeds: [mintSignerSeeds] },
      // A seed set that signs for nothing these instructions touch. Seeds name an account the
      // transaction uses, so this is rejected: tolerating seeds that correspond to no account is
      // what would let a trailing instruction be presented as seeds instead.
      { instructions, signerSeeds: [mintSignerSeeds] },
    ]);
    const canopy = Keypair.generate();
    const executedTransactions = Keypair.generate();
    const canopySize = getCanopySize(merkleTree.depth - 1);
    const canopyRent =
      await provider.connection.getMinimumBalanceForRentExemption(canopySize);
    const executedTransactionsSize = 1 + getBitmapLen(merkleTree.depth - 1);
    const executedTransactionsRent =
      await provider.connection.getMinimumBalanceForRentExemption(
        executedTransactionsSize
      );
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
      cacheDepth: merkleTree.depth - 1,
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
          signerSeeds: [],
        },
      ];
      const { compiledTransactions: badTransactions } = compile(
        lazySigner,
        bogus
      );
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

    /// A seed set deriving an address the instructions never reference is rejected
    try {
      await program.methods
        .executeTransactionV0({
          instructions: compiledTransactions[3].instructions,
          index: compiledTransactions[3].index,
          signerSeeds: compiledTransactions[3].signerSeeds,
        })
        .accountsPartial({ lazyTransactions })
        .remainingAccounts(compiledTransactions[3].accounts)
        .rpc({ skipPreflight: true });

      throw new Error("Should have failed");
    } catch (e: any) {
      expect(e.toString()).to.not.include("Should have failed");
      expect(e.toString()).to.include(
        "Signer seeds derive an address this transaction does not use"
      );
    }

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
      console.log(e.toString());
      expect(e.toString()).to.include("Transaction has already been executed");
    }

    /// Attempt to close the canopy
    console.log("Closing canopy");
    await program.methods
      .closeCanopyV0()
      .accountsPartial({ lazyTransactions, refund: provider.wallet.publicKey })
      .rpc({ skipPreflight: true });
  });

  it("rejects trailing instructions re-labelled as signer seeds", async () => {
    const name = random(10);
    const lazySigner = lazySignerKey(name)[0];
    const lazyTransactions = lazyTransactionsKey(name)[0];
    const dest = Keypair.generate().publicKey;

    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: lazySigner,
        lamports: 100000000,
      }),
    ]);

    // Two identical transfers. The second names no account the first does not, so dropping it
    // leaves the highest referenced account index unchanged, and the account/proof split the
    // program derives from the instructions is the same either way. That is what lets a re-split
    // reach the merkle proof at all.
    const transfer = () =>
      SystemProgram.transfer({
        fromPubkey: lazySigner,
        toPubkey: dest,
        lamports: 1000000,
      });
    const { merkleTree, compiledTransactions } = compile(lazySigner, [
      { instructions: [transfer(), transfer()], signerSeeds: [] },
      { instructions: [transfer()], signerSeeds: [] },
    ]);

    const canopy = Keypair.generate();
    const executedTransactions = Keypair.generate();
    const canopySize = getCanopySize(merkleTree.depth - 1);
    const canopyRent =
      await provider.connection.getMinimumBalanceForRentExemption(canopySize);
    const executedTransactionsSize = 1 + getBitmapLen(merkleTree.depth - 1);
    const executedTransactionsRent =
      await provider.connection.getMinimumBalanceForRentExemption(
        executedTransactionsSize
      );
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
      cacheDepth: merkleTree.depth - 1,
    });
    await sleep(2000);

    const compiled = compiledTransactions[0];
    // The leaf preimage concatenates accounts, instructions, seeds and index with nothing marking
    // where one section ends, so handing the trailing instruction's exact bytes back as a signer
    // seed reproduces the same preimage, the same hash and a valid proof, while that instruction
    // never executes.
    const relabelled = ixToBin(compiled.instructions[1]);

    try {
      await program.methods
        .executeTransactionV0({
          instructions: [compiled.instructions[0]],
          index: compiled.index,
          signerSeeds: [[relabelled]],
        })
        .accountsPartial({ lazyTransactions })
        .remainingAccounts(compiled.accounts)
        .rpc({ skipPreflight: true });

      throw new Error("Should have failed");
    } catch (e: any) {
      expect(e.toString()).to.not.include("Should have failed");
      // Either message is a rejection of the re-labelling: the bytes derive an address the
      // transaction does not use, or they do not derive a program address at all.
      expect(e.toString()).to.match(
        /do not derive a valid program address|derive an address this transaction does not use/
      );
    }

    // The honest leaf still executes, and both transfers land.
    const before = await provider.connection.getBalance(dest);
    await program.methods
      .executeTransactionV0({
        instructions: compiled.instructions,
        index: compiled.index,
        signerSeeds: compiled.signerSeeds,
      })
      .accountsPartial({ lazyTransactions })
      .remainingAccounts(compiled.accounts)
      .rpc({ skipPreflight: true });
    expect((await provider.connection.getBalance(dest)) - before).to.eq(2000000);
  });
});

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
