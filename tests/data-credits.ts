import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  init,
  isInitialized,
  dataCreditsKey,
  tokenAuthorityKey,
  mintDataCreditsInstructions,
  burnDataCreditsInstructions,
} from "../packages/data-credits-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { createAtaAndMint, createMint } from "./utils/token";
import { getAssociatedTokenAddress, getAccount, burn } from "@solana/spl-token";
import { toBN, execute } from "@helium-foundation/spl-utils";

export const initTestDataCredits = async (
  program: Program<DataCredits>,
  provider: anchor.AnchorProvider,
  startingHntbal: number = 100
): Promise<{
  dcKey: PublicKey;
  hntMint: PublicKey;
  dcMint: PublicKey;
  hntBal: number;
  dcBal: number;
}> => {
  const dcKey = dataCreditsKey()[0];
  const me = provider.wallet.publicKey;
  const [tokenAuth] = tokenAuthorityKey();
  let hntMint;
  let hntBal = startingHntbal;
  let dcMint;
  let dcBal = 0;

  if (await isInitialized(program)) {
    // accounts for rerunning tests on same localnet
    const dcAcc = await program.account.dataCreditsV0.fetch(dcKey);
    hntMint = dcAcc.hntMint;
    dcMint = dcAcc.dcMint;

    const dcAta = await getAssociatedTokenAddress(dcMint, me);

    dcBal =
      (await provider.connection.getTokenAccountBalance(dcAta)).value
        .uiAmount || 0;

    hntBal =
      (
        await provider.connection.getTokenAccountBalance(
          await getAssociatedTokenAddress(hntMint, me)
        )
      ).value.uiAmount || 0;
  } else {
    hntMint = await createMint(provider, 8, me, me);
    dcMint = await createMint(provider, 8, tokenAuth, tokenAuth);

    const initDataCredits = await program.methods
      .initializeDataCreditsV0({ authority: me })
      .accounts({ hntMint, dcMint });

    await createAtaAndMint(
      provider,
      hntMint,
      toBN(startingHntbal, 8).toNumber(),
      me
    );

    await initDataCredits.rpc();
  }

  return { dcKey, hntMint, hntBal, dcMint, dcBal };
};

describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<DataCredits>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    program = await init(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );
  });

  it("initializes data credits", async () => {
    const { dcKey, dcMint, hntMint } = await initTestDataCredits(
      program,
      provider
    );

    const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dcKey);

    const [tokenAuth, tokenAuthBump] = tokenAuthorityKey();

    expect(dataCreditsAcc?.dcMint.toBase58()).eq(dcMint.toBase58());
    expect(dataCreditsAcc?.hntMint.toBase58()).eq(hntMint.toBase58());
    expect(dataCreditsAcc?.authority.toBase58()).eq(me.toBase58());
    expect(dataCreditsAcc?.tokenAuthority.toBase58()).eq(tokenAuth.toBase58());
    expect(dataCreditsAcc?.tokenAuthorityBump).eq(tokenAuthBump);
  });

  describe("with data credits", async () => {
    it("mints some data credits", async () => {
      const {
        dcMint,
        dcBal: previousDcBal,
        hntMint,
        hntBal: previousHntBal,
      } = await initTestDataCredits(program, provider);

      const ix = await mintDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      expect(dcAtaAcc.isFrozen);

      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(hntMint, me)
      );

      expect(dcBal.value.uiAmount).eq(previousDcBal + 1);
      expect(hntBal.value.uiAmount).eq(previousHntBal - 1);
    });

    it("burns some data credits", async () => {
      const { dcMint, dcBal: previousDcBal } = await initTestDataCredits(
        program,
        provider
      );

      const ix = await burnDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      expect(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      expect(dcBal.value.uiAmount).eq(previousDcBal - 1);
    });
  });
});
