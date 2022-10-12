import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { CircuitBreaker } from "@helium-foundation/idls/lib/types/circuit_breaker";
import { assert, expect } from "chai";
import { init, PROGRAM_ID } from "../packages/circuit-breaker-sdk/src";
import { createMint } from "@helium-foundation/spl-utils";
import { BN } from "bn.js";


let MAX_U32 = 4294967295;

function percent(percent: number): number {
  return Math.floor((percent / 100) * MAX_U32)
}

describe("circuit-breaker", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let program: Program<CircuitBreaker>;
  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.CircuitBreaker.idl
    );
  })

  it("initializes a mint windowed breaker", async () => {
    const mint = await createMint(provider, 8, me, me);
    const method = await program.methods.initializeMintWindowedBreakerV0({
      authority: me,
      config: {
        windowSizeSeconds: new BN(10),
        thresholdPercent: percent(50)
      }
    }).accounts({
      mint
    });
    const circuitBreaker = (await method.pubkeys()).circuitBreaker!;
    await method.rpc();

    const acct = await program.account.mintWindowedCircuitBreakerV0.fetch(circuitBreaker);
    expect(acct.lastWindow.lastAggregatedValue.toNumber()).to.eq(0);
    expect(acct.config.thresholdPercent).to.eq(percent(50));
    expect(acct.config.windowSizeSeconds.toNumber()).to.eq(10);
  });
})