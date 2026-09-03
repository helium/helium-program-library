import { AnchorProvider } from "@coral-xyz/anchor";
import {
  PROGRAM_ID as HSD_PROGRAM_ID,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { initCachedProgram } from "../../src/lib/anchor-idl-cache";

/**
 * A provider that counts the account reads Anchor makes. `Program.fetchIdl`
 * does exactly one `getAccountInfo` on the program's IDL PDA, so the count is
 * the number of IDL fetches.
 */
const countingProvider = () => {
  const reads: string[] = [];
  const connection = {
    getAccountInfo: async (key: PublicKey) => {
      reads.push(key.toBase58());
      return null;
    },
  } as unknown as Connection;

  return {
    reads,
    provider: new AnchorProvider(
      connection,
      { publicKey: Keypair.generate().publicKey } as never,
      {},
    ),
  };
};

describe("initCachedProgram", () => {
  it("fetches a program's IDL once across requests", async () => {
    const first = countingProvider();
    const second = countingProvider();

    await initCachedProgram(initHsd, HSD_PROGRAM_ID, first.provider);
    await initCachedProgram(initHsd, HSD_PROGRAM_ID, second.provider);

    expect(first.reads.length + second.reads.length).to.equal(1);
  });

  it("binds each program to the provider it was given", async () => {
    const first = countingProvider();
    const second = countingProvider();

    const firstProgram = await initCachedProgram(
      initHsd,
      HSD_PROGRAM_ID,
      first.provider,
    );
    const secondProgram = await initCachedProgram(
      initHsd,
      HSD_PROGRAM_ID,
      second.provider,
    );

    expect(firstProgram.provider).to.equal(first.provider);
    expect(secondProgram.provider).to.equal(second.provider);
  });
});
