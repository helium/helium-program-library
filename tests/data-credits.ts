import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { DataCreditsSdk } from "../packages/data-credits-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { createAtaAndMint, createMint, mintTo } from "./utils/token";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { toBN, toNumber } from "@helium-foundation/spl-utils";

describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const program = anchor.workspace.DataCredits as Program<DataCredits>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const dataCreditsSdk = new DataCreditsSdk(
    provider as anchor.AnchorProvider,
    program
  );
  let hntMint: PublicKey;
  let dcMint: PublicKey;
  let dataCredits: PublicKey;
  const hntDecimals = 5;
  const dcDecimals = 5;
  before(async () => {
    const [tokenAuth] = await DataCreditsSdk.tokenAuthorityKey();
    hntMint = await createMint(provider, hntDecimals, me, me);
    dcMint = await createMint(provider, dcDecimals, tokenAuth, tokenAuth);
    await createAtaAndMint(provider, hntMint, toBN(100, hntDecimals).toNumber(), me);

    ({ dataCredits } = await dataCreditsSdk.initializeDataCredits({
      hntMint, dcMint
  }));
  });

  it("initializes data credits", async () => {
    const dataCreditsAcc = await dataCreditsSdk.getDataCredits(
      dataCredits
    );
    const [tokenAuth, tokenAuthBump] = await DataCreditsSdk.tokenAuthorityKey();
    assert(dataCreditsAcc?.dcMint.equals(dcMint));
    assert(dataCreditsAcc?.hntMint.equals(hntMint));
    assert(dataCreditsAcc?.authority.equals(me));
    assert(dataCreditsAcc?.tokenAuthority.equals(tokenAuth));
    assert(dataCreditsAcc?.publicKey.equals(dataCredits));
    assert(dataCreditsAcc?.tokenAuthorityBump == tokenAuthBump);
  });

  describe("with data credits", async() => {
    it("mints some data credits", async () => {
      await dataCreditsSdk.mintDataCredits({
        amount: 1,
        owner: me,
        recipient: me,
      });

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(await getAssociatedTokenAddress(hntMint, me));
      assert(dcBal.value.uiAmount == 1);
      assert(hntBal.value.uiAmount == 99);      
    })

    it("burns some data credits", async() => {
      await dataCreditsSdk.burnDataCredits({
        amount: 1,
        owner: me,
      });

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      assert(dcBal.value.uiAmount == 0);
    })
  })
});
