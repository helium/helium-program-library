import assert from "node:assert/strict";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { HNT_MINT, IOT_MINT } from "@helium/spl-utils";
import { createService } from "../src/service";

const USER = Keypair.generate().publicKey;
const PLATFORM = Keypair.generate().publicKey;

/** A service over fake builders that record their calls, on a clock the test moves by hand. */
const fakeService = (
  options: { failBuilds?: number; maxSignaturesPerMinute?: number } = {}
) => {
  let time = 1_000_000;
  let estimates = 0;
  let failBuilds = options.failBuilds ?? 0;
  const estimated: { mint: string; platformWallet: string }[] = [];
  const built: { mint: string; inputAmount: string; userWallet: string }[] = [];
  const service = createService({
    estimateSwapInput: async (params) => {
      estimated.push(params);
      estimates += 1;
      return `${estimates}000`;
    },
    buildFundFeesTransaction: async (params) => {
      built.push(params);
      if (failBuilds > 0) {
        failBuilds -= 1;
        throw new Error("simulation failed");
      }
      return {
        serialize: () => Uint8Array.from([built.length]),
      } as unknown as VersionedTransaction;
    },
    connection: {} as never,
    signer: {
      publicKey: PLATFORM,
      signTransaction: async (tx) => tx,
    },
    lookupTableAccounts: async () => [],
    now: () => time,
    maxSignaturesPerMinute: options.maxSignaturesPerMinute ?? 100,
    apiUrl: "https://jupiter.test",
    apiKey: "key",
  });
  return {
    ...service,
    estimated,
    built,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

describe("createService", () => {
  it("prices a mint for the platform wallet and reuses the estimate for 15 seconds", async () => {
    const service = fakeService();

    const first = await service.estimate({ mint: HNT_MINT });
    service.advance(14_999);
    const second = await service.estimate({ mint: HNT_MINT });
    service.advance(1);
    const third = await service.estimate({ mint: HNT_MINT });

    assert.deepEqual([first, second, third], ["1000", "1000", "2000"]);
    assert.deepEqual(service.estimated[0], {
      apiUrl: "https://jupiter.test",
      apiKey: "key",
      mint: HNT_MINT.toBase58(),
      platformWallet: PLATFORM.toBase58(),
    });
  });

  it("builds the fee-funding transaction with the cached estimate as its input", async () => {
    const service = fakeService();

    await service.estimate({ mint: HNT_MINT });
    await service.fundFees({ userWallet: USER, mint: HNT_MINT });

    assert.equal(service.estimated.length, 1);
    assert.deepEqual(service.built, [
      {
        apiUrl: "https://jupiter.test",
        apiKey: "key",
        mint: HNT_MINT.toBase58(),
        inputAmount: "1000",
        userWallet: USER.toBase58(),
      },
    ]);
  });

  it("builds once for two requests of a wallet for the same mint and returns the same bytes", async () => {
    const service = fakeService();

    const [first, second] = await Promise.all([
      service.fundFees({ userWallet: USER, mint: HNT_MINT }),
      service.fundFees({ userWallet: USER, mint: HNT_MINT }),
    ]);

    assert.equal(service.built.length, 1);
    assert.deepEqual([...first], [1]);
    assert.deepEqual([...second], [1]);
  });

  it("builds for a wallet's request for another mint", async () => {
    const service = fakeService();

    const hnt = await service.fundFees({ userWallet: USER, mint: HNT_MINT });
    const iot = await service.fundFees({ userWallet: USER, mint: IOT_MINT });

    assert.deepEqual([...hnt], [1]);
    assert.deepEqual([...iot], [2]);
    assert.deepEqual(
      service.built.map(({ mint }) => mint),
      [HNT_MINT.toBase58(), IOT_MINT.toBase58()]
    );
  });

  it("builds again after a failed build", async () => {
    const service = fakeService({ failBuilds: 1 });

    await assert.rejects(
      service.fundFees({ userWallet: USER, mint: HNT_MINT }),
      /simulation failed/
    );
    const bytes = await service.fundFees({ userWallet: USER, mint: HNT_MINT });

    assert.equal(service.built.length, 2);
    assert.deepEqual([...bytes], [2]);
  });
});
