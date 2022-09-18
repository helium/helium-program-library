import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { DataCreditsSdk } from "../packages/data-credits-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { createMint } from "./utils/token";

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
  let dcMint: PublicKey

  beforeEach(async () => {
    hntMint = await createMint(provider, 10, me, me);
    dcMint = await createMint(provider, 10, me, me);
  });

  it("initializes data credits", async () => {
    const { dataCredits } =
      await dataCreditsSdk.initializeDataCredits({
        hntMint,
        dcMint,
      });
    const dataCreditsAcc = await dataCreditsSdk.getDataCredits(
      dataCredits
    );
    console.log(dataCreditsAcc);
    const [tokenAuth, tokenAuthBump] = await DataCreditsSdk.tokenAuthorityKey();
    assert(dataCreditsAcc?.dcMint.equals(dcMint));
    assert(dataCreditsAcc?.hntMint.equals(hntMint));
    assert(dataCreditsAcc?.authority.equals(me));
    assert(dataCreditsAcc?.tokenAuthority.equals(tokenAuth));
    assert(dataCreditsAcc?.publicKey.equals(dataCredits));
    assert(dataCreditsAcc?.tokenAuthorityBump == tokenAuthBump);
  });
});
