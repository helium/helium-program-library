import * as anchor from "@coral-xyz/anchor";
import { AccountFetchCache, chunks } from "@helium/account-fetch-cache";
import {
  init as initOrg,
  organizationKey,
  proposalKey,
} from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import { bulkSendTransactions } from "@helium/spl-utils";
import { init as initState } from "@helium/state-controller-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { SystemProgram, Transaction } from "@solana/web3.js";
import pLimit from "p-limit";

(async () => {
  try {
    if (!process.env.ANCHOR_WALLET)
      throw new Error("ANCHOR_WALLET not provided");

    if (!process.env.SOLANA_URL) throw new Error("SOLANA_URL not provided");

    process.env.ANCHOR_PROVIDER_URL = process.env.SOLANA_URL;
    anchor.setProvider(anchor.AnchorProvider.local(process.env.SOLANA_URL));

    const provider = anchor.getProvider() as anchor.AnchorProvider;
    new AccountFetchCache({
      connection: provider.connection,
      commitment: "confirmed",
      extendConnection: true,
    });
    const orgProgram = await initOrg(provider);
    const stateProgram = await initState(provider);
    const proposalProgram = await initProposal(provider);
    const vsrProgram = await initVsr(provider);
    for (const orgName of ["Helium", "Helium MOBILE", "Helium IOT"]) {
      console.log(`Checking for expired proposals in ${orgName}`);
      const organizationK = organizationKey(orgName)[0];
      const organization =
        await orgProgram.account.organizationV0.fetchNullable(organizationK);
      if (!organization) {
        continue;
      }
      const proposalKeys = Array(organization?.numProposals)
        .fill(0)
        .map((_, index) => proposalKey(organizationK, index)[0])
        .reverse();

      const proposals = await Promise.all(
        proposalKeys.map(async (p) => ({
          account: await proposalProgram.account.proposalV0.fetch(p),
          pubkey: p,
        }))
      );
      const openProposals = proposals.filter(
        (p) => typeof p.account.state.voting !== "undefined"
      );

      const resolveIxs = await Promise.all(
        openProposals.map(async (p) => {
          return await stateProgram.methods
            .resolveV0()
            .accounts({
              proposal: p.pubkey,
            })
            .instruction();
        })
      );

      const txs = chunks(resolveIxs, 10).map((ixs) => {
        const tx = new Transaction({
          feePayer: provider.wallet.publicKey,
        });
        tx.add(...ixs);
        return tx;
      });

      await bulkSendTransactions(provider, txs);
    }

    const markers = (await vsrProgram.account.voteMarkerV0.all()).filter(
      (m) => !m.account.relinquished
    );
    const limit = pLimit(100);
    const relinquishIxns = await Promise.all(
      markers.map((marker) =>
        limit(async () => {
          return await vsrProgram.methods
            .relinquishExpiredVoteV0()
            .accountsStrict({
              marker: marker.publicKey,
              position: positionKey(marker.account.mint)[0],
              proposal: marker.account.proposal,
              systemProgram: SystemProgram.programId,
            })
            .instruction();
        })
      )
    );
    const txns = chunks(relinquishIxns, 10).map((ixs) => {
      const tx = new Transaction({
        feePayer: provider.wallet.publicKey,
      });
      tx.add(...ixs);
      return tx;
    });
    await bulkSendTransactions(provider, txns);

    process.exit(0);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
})();
