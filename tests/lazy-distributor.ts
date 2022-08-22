import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { LazyDistributorSdk } from "../packages/lazy-distributor-sdk/src";
import { LazyDistributor } from "../target/types/lazy_distributor";

describe("helium", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.LazyDistributor as Program<LazyDistributor>;
  const provider = anchor.getProvider();
  const lazyDistributorSdk = new LazyDistributorSdk(provider as anchor.AnchorProvider, program);

  it("initializes a lazy distributor", async () => {
    
  });
});
