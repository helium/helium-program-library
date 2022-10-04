import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import {
  init,
  tokenAuthorityKey,
  mintDataCreditsInstructions,
  burnDataCreditsInstructions,
} from "../packages/data-credits-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { createAtaAndMint, createMint } from "./utils/token";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { toBN, execute } from "@helium-foundation/spl-utils";

export const initTestDataCredits = async (
  program: Program<DataCredits>,
  provider: anchor.AnchorProvider
): Promise<{
  hntMint: PublicKey;
  dcMint: PublicKey;
  dataCredits: PublicKey;
}> => {
  const me = provider.wallet.publicKey;
  const [tokenAuth] = tokenAuthorityKey();
  const hntMint = await createMint(provider, 8, me, me);
  const dcMint = await createMint(provider, 8, tokenAuth, tokenAuth);

  const initDataCredits = await program.methods
    .initializeDataCreditsV0({ authority: me })
    .accounts({ hntMint, dcMint });

  const { dataCredits } = await initDataCredits.pubkeys();

  await createAtaAndMint(provider, hntMint, toBN(100, 8).toNumber(), me);

  await initDataCredits.rpc();

  return { hntMint, dcMint, dataCredits: dataCredits! };
};

describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<DataCredits>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let hntMint: PublicKey;
  let dcMint: PublicKey;
  let dcKey: PublicKey;

  before(async () => {
    program = await init(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );

    const {
      dataCredits,
      hntMint: beforeHntMint,
      dcMint: beforeDcMint,
    } = await initTestDataCredits(program, provider);

    hntMint = beforeHntMint;
    dcMint = beforeDcMint;
    dcKey = dataCredits;
  });

  it("initializes data credits", async () => {
    const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dcKey);
    const [tokenAuth, tokenAuthBump] = tokenAuthorityKey();

    assert(dataCreditsAcc?.dcMint.equals(dcMint));
    assert(dataCreditsAcc?.hntMint.equals(hntMint));
    assert(dataCreditsAcc?.authority.equals(me));
    assert(dataCreditsAcc?.tokenAuthority.equals(tokenAuth));
    assert(dataCreditsAcc?.tokenAuthorityBump == tokenAuthBump);
  });

  describe("with data credits", async () => {
    it("mints some data credits", async () => {
      const ix = await mintDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(hntMint, me)
      );
      assert(dcBal.value.uiAmount == 1);
      assert(hntBal.value.uiAmount == 99);
    });

    it("burns some data credits", async () => {
      const ix = await burnDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      assert(dcBal.value.uiAmount == 0);
    });
  });
});
