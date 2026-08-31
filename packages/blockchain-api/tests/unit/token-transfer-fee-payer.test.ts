import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { expect } from "chai";
import { describe, it } from "mocha";
import { toVersionedTx } from "../../../spl-utils/src/transaction";
import { TransferInputSchema } from "../../../blockchain-api-client/src/schemas/tokens";
import {
  buildTransferInstructions,
  transferSolShortfall,
} from "../../src/server/api/routers/tokens/procedures/transfer-helpers";
import { generateTransactionTag } from "../../src/lib/utils/transaction-tags";

const AUTHORITY = new PublicKey("GZairnxHiWXk73YhsEtkGU2XnfGw3QcUsjJr8VW2R172");
const PAYER = new PublicKey("ATGQKkmNat3N8ZXM2ChEKMNAQ45isPPfUpBrAnvX9J8R");
const DESTINATION = new PublicKey(
  "8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF"
);
const HNT_MINT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const AMOUNT = BigInt(100000000);

/** A fixed blockhash, so a compiled message is a byte-for-byte constant. */
const BLOCKHASH = "11111111111111111111111111111111";

/**
 * The compiled messages the endpoint produced before it took a fee payer,
 * captured by running the previous instruction builder against these same
 * fixed inputs. An omitted `feePayer` has to reproduce them exactly.
 */
const MESSAGE_WITHOUT_FEE_PAYER = {
  spl: "gAEABQjnOATfO2FjSIwKETu5VcjeMIFSGdfTdWFp1bNOCQYAzSdWOdDIf1xzj9P/Z4jbcymxZX3P/RbstVSmQHM5J3N8sILxMPPz9aoitDahb5EssExJtLp4lxutNQc9sZcJV0GMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4WW7QWPIqzDgiyi7wtCocDkW1Iu1jJ/sP5uGy8tqyB0BcCnMgk5GFYffdf8vsSr2FE97KGpZ/etejnWO0HtiTgIsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAwYAAQQFBgcBAQcEAgUBAAoMAOH1BQAAAAAIAA==",
  sol: "gAEAAQPnOATfO2FjSIwKETu5VcjeMIFSGdfTdWFp1bNOCQYAzW7QWPIqzDgiyi7wtCocDkW1Iu1jJ/sP5uGy8tqyB0BcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAECAgABDAIAAAAA4fUFAAAAAAA=",
};

/** A connection whose only answer is that the recipient has no token account. */
const noRecipientAta = {
  getAccountInfo: async () => null,
} as unknown as Connection;

/** The message the endpoint compiles, through the same helper it uses. */
function compiledMessage(
  instructions: TransactionInstruction[],
  feePayer: PublicKey
) {
  return toVersionedTx({
    instructions,
    feePayer,
    recentBlockhash: BLOCKHASH,
    addressLookupTables: [],
  }).message;
}

/** The compiled message's bytes, for comparison against a fixture. */
function messageBase64(
  instructions: TransactionInstruction[],
  feePayer: PublicKey
) {
  const bytes = compiledMessage(instructions, feePayer).serialize();
  return Buffer.from(bytes).toString("base64");
}

/** Every account a compiled message requires a signature from. */
function signerKeys(instructions: TransactionInstruction[], payer: PublicKey) {
  const message = compiledMessage(instructions, payer);
  return message.staticAccountKeys
    .slice(0, message.header.numRequiredSignatures)
    .map((key) => key.toBase58());
}

/** The accounts one instruction requires a signature from. */
function instructionSigners(instruction: TransactionInstruction) {
  return instruction.keys
    .filter((key) => key.isSigner)
    .map((key) => key.pubkey.toBase58());
}

const splTransfer = (payer: PublicKey) =>
  buildTransferInstructions({
    connection: noRecipientAta,
    authority: AUTHORITY,
    payer,
    destination: DESTINATION,
    mint: HNT_MINT,
    rawAmount: AMOUNT,
    isSol: false,
  });

const solTransfer = (payer: PublicKey) =>
  buildTransferInstructions({
    connection: noRecipientAta,
    authority: AUTHORITY,
    payer,
    destination: DESTINATION,
    mint: WSOL_MINT,
    rawAmount: AMOUNT,
    isSol: true,
  });

describe("TransferInputSchema feePayer", () => {
  const base = {
    walletAddress: AUTHORITY.toBase58(),
    destination: DESTINATION.toBase58(),
    tokenAmount: { amount: "100000000", mint: HNT_MINT },
  };

  it("is absent when the caller omits it", () => {
    expect(TransferInputSchema.parse(base).feePayer).to.eq(undefined);
  });

  it("accepts a wallet address", () => {
    const parsed = TransferInputSchema.parse({
      ...base,
      feePayer: PAYER.toBase58(),
    });
    expect(parsed.feePayer).to.eq(PAYER.toBase58());
  });

  it("rejects an address that is not base58 of the right length", () => {
    const parsed = TransferInputSchema.safeParse({
      ...base,
      feePayer: "not-a-wallet",
    });
    expect(parsed.success).to.eq(false);
  });

});

describe("buildTransferInstructions without a separate fee payer", () => {
  it("compiles the SPL transfer to the same message as before", async () => {
    const { instructions, needsAta } = await splTransfer(AUTHORITY);
    expect(needsAta).to.eq(true);
    expect(messageBase64(instructions, AUTHORITY)).to.eq(
      MESSAGE_WITHOUT_FEE_PAYER.spl
    );
  });

  it("compiles the SOL transfer to the same message as before", async () => {
    const { instructions } = await solTransfer(AUTHORITY);
    expect(messageBase64(instructions, AUTHORITY)).to.eq(
      MESSAGE_WITHOUT_FEE_PAYER.sol
    );
  });

  it("needs the wallet's signature and nothing else", async () => {
    const { instructions } = await splTransfer(AUTHORITY);
    expect(signerKeys(instructions, AUTHORITY)).to.deep.eq([
      AUTHORITY.toBase58(),
    ]);
  });
});

describe("buildTransferInstructions with a separate fee payer", () => {
  it("funds the recipient's token account from the fee payer", async () => {
    const { instructions } = await splTransfer(PAYER);
    const [createAta] = instructions;
    expect(instructionSigners(createAta)).to.deep.eq([PAYER.toBase58()]);
  });

  it("keeps the wallet as the source authority", async () => {
    const { instructions } = await splTransfer(PAYER);
    const [, transferChecked] = instructions;
    expect(instructionSigners(transferChecked)).to.deep.eq([
      AUTHORITY.toBase58(),
    ]);
    expect(transferChecked.keys[0].pubkey.toBase58()).to.eq(
      getAssociatedTokenAddressSync(
        new PublicKey(HNT_MINT),
        AUTHORITY,
        true
      ).toBase58()
    );
  });

  it("requires both signatures, with the fee payer first", async () => {
    const { instructions } = await splTransfer(PAYER);
    expect(signerKeys(instructions, PAYER)).to.deep.eq([
      PAYER.toBase58(),
      AUTHORITY.toBase58(),
    ]);
  });

  it("still moves native SOL out of the wallet, not the fee payer", async () => {
    const { instructions } = await solTransfer(PAYER);
    expect(instructions).to.have.length(1);
    expect(instructionSigners(instructions[0])).to.deep.eq([
      AUTHORITY.toBase58(),
    ]);
    expect(signerKeys(instructions, PAYER)).to.deep.eq([
      PAYER.toBase58(),
      AUTHORITY.toBase58(),
    ]);
  });
});

describe("transferSolShortfall", () => {
  const FEE = 940880;

  describe("when the wallet pays its own fee", () => {
    it("charges fee only for an SPL transfer", () => {
      expect(
        transferSolShortfall({
          payerBalance: FEE,
          payerLamports: FEE,
          transferLamports: 0,
          authorityBalance: null,
        })
      ).to.eq(null);

      expect(
        transferSolShortfall({
          payerBalance: FEE - 1,
          payerLamports: FEE,
          transferLamports: 0,
          authorityBalance: null,
        })
      ).to.deep.eq({
        message: "Insufficient SOL balance for transaction fees",
        required: FEE,
        available: FEE - 1,
      });
    });

    it("charges fee plus the transfer for a SOL transfer", () => {
      expect(
        transferSolShortfall({
          payerBalance: FEE + 500,
          payerLamports: FEE,
          transferLamports: 500,
          authorityBalance: null,
        })
      ).to.eq(null);

      expect(
        transferSolShortfall({
          payerBalance: FEE + 499,
          payerLamports: FEE,
          transferLamports: 500,
          authorityBalance: null,
        })
      ).to.deep.eq({
        message: "Insufficient SOL balance for transfer and transaction fees",
        required: FEE + 500,
        available: FEE + 499,
      });
    });
  });

  describe("when a separate account pays the fee", () => {
    it("charges the transfer to the wallet and the fee to the payer", () => {
      expect(
        transferSolShortfall({
          payerBalance: FEE,
          payerLamports: FEE,
          transferLamports: 500,
          authorityBalance: 500,
        })
      ).to.eq(null);
    });

    it("lets the wallet be emptied to exactly zero", () => {
      expect(
        transferSolShortfall({
          payerBalance: FEE,
          payerLamports: FEE,
          transferLamports: 1234,
          authorityBalance: 1234,
        })
      ).to.eq(null);
    });

    it("reports the payer's shortfall without the transfer amount", () => {
      expect(
        transferSolShortfall({
          payerBalance: FEE - 1,
          payerLamports: FEE,
          transferLamports: 500,
          authorityBalance: 500,
        })
      ).to.deep.eq({
        message: "Insufficient SOL balance for transaction fees",
        required: FEE,
        available: FEE - 1,
      });
    });

    it("reports the wallet's shortfall against the transfer alone", () => {
      expect(
        transferSolShortfall({
          payerBalance: FEE,
          payerLamports: FEE,
          transferLamports: 500,
          authorityBalance: 499,
        })
      ).to.deep.eq({
        message: "Insufficient SOL balance for transfer",
        required: 500,
        available: 499,
      });
    });

    it("does not charge an SPL transfer to the wallet's SOL balance", () => {
      expect(
        transferSolShortfall({
          payerBalance: FEE,
          payerLamports: FEE,
          transferLamports: 0,
          authorityBalance: null,
        })
      ).to.eq(null);
    });
  });
});

describe("token transfer tag", () => {
  const params = {
    type: "token_transfer",
    walletAddress: AUTHORITY.toBase58(),
    destination: DESTINATION.toBase58(),
    mint: HNT_MINT,
    amount: "100000000",
  };

  it("is unchanged when no fee payer is named", () => {
    expect(generateTransactionTag({ ...params, feePayer: undefined })).to.eq(
      generateTransactionTag(params)
    );
  });

  it("differs once a fee payer is named", () => {
    expect(
      generateTransactionTag({ ...params, feePayer: PAYER.toBase58() })
    ).to.not.eq(generateTransactionTag(params));
  });
});
