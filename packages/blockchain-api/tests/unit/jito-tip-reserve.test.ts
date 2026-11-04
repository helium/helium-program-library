import { AnchorProvider } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PACKET_DATA_SIZE,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  batchInstructionsToTxsWithPriorityFee,
  toVersionedTx,
} from "../../../spl-utils/src/transaction";
import { JITO_TIP_RESERVE_BYTES } from "../../src/lib/constants/jito";

const FEE_PAYER = Keypair.generate().publicKey;
const NOOP_PROGRAM = Keypair.generate().publicKey;
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

// The tip account is picked at random from Jito's list and is never in a
// lookup table, so the tip always adds a static key.
const tipInstruction = () =>
  SystemProgram.transfer({
    fromPubkey: FEE_PAYER,
    toPubkey: Keypair.generate().publicKey,
    lamports: 10000,
  });

const noopInstruction = (dataBytes: number) =>
  new TransactionInstruction({
    programId: NOOP_PROGRAM,
    keys: [
      {
        pubkey: Keypair.generate().publicKey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: Keypair.generate().publicKey,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.alloc(dataBytes, 1),
  });

const serializedSize = (instructions: TransactionInstruction[]) =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: FEE_PAYER,
      recentBlockhash: BLOCKHASH,
      instructions,
    }).compileToV0Message()
  ).serialize().length;

// Enough surface for the batcher's blockhash fetch, priority-fee estimation,
// and compute-unit simulation. No network.
const makeProvider = () =>
  ({
    connection: {
      _rpcEndpoint: "http://localhost:0",
      rpcEndpoint: "http://localhost:0",
      getLatestBlockhash: async () => ({
        blockhash: BLOCKHASH,
        lastValidBlockHeight: 1,
      }),
      _rpcRequest: async () => ({ result: { priorityFeeEstimate: 1 } }),
      _buildArgs: (args: unknown[]) => args,
      getRecentPrioritizationFees: async () => [],
      simulateTransaction: async () => ({
        context: { slot: 1 },
        value: { err: null, unitsConsumed: 100000, logs: [] },
      }),
    } as unknown as Connection,
    wallet: { publicKey: FEE_PAYER },
  }) as unknown as AnchorProvider;

const fitsWithTip = async (
  draft: Awaited<
    ReturnType<typeof batchInstructionsToTxsWithPriorityFee>
  >[number]
) => {
  const withTip = {
    ...draft,
    instructions: [...draft.instructions, tipInstruction()],
  };
  const tx = await toVersionedTx(withTip);
  return tx.serialize().length <= PACKET_DATA_SIZE;
};

describe("Jito tip reserve", () => {
  it("covers the tip in a tx that has no System Program key yet", () => {
    const base = [noopInstruction(200)];
    const delta =
      serializedSize([...base, tipInstruction()]) - serializedSize(base);

    expect(delta).to.be.at.most(JITO_TIP_RESERVE_BYTES);
  });

  it("leaves room for the tip in every tx of a full bundle", async () => {
    const provider = makeProvider();
    // Odd-sized groups so plain packing ends each tx with only a few spare bytes.
    const groups = Array.from({ length: 24 }, (_, i) => [
      noopInstruction(250 + (i % 3) * 7),
    ]);

    const unreserved = await batchInstructionsToTxsWithPriorityFee(
      provider,
      groups,
      {
        computeUnitLimit: 200000,
      }
    );
    const unreservedFits = await Promise.all(unreserved.map(fitsWithTip));
    expect(
      unreservedFits,
      "control: plain packing should leave a tx too full for the tip"
    ).to.include(false);

    const reserved = await batchInstructionsToTxsWithPriorityFee(
      provider,
      groups,
      {
        computeUnitLimit: 200000,
        maxTxSize: PACKET_DATA_SIZE - JITO_TIP_RESERVE_BYTES,
      }
    );
    const reservedFits = await Promise.all(reserved.map(fitsWithTip));
    expect(reservedFits).to.not.include(false);
  });
});
