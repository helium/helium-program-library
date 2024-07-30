import * as anchor from "@coral-xyz/anchor";
import { AccountFetchCache, chunks } from "@helium/account-fetch-cache";
import {
  init as initOrg,
  organizationKey,
  proposalKey,
} from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  bulkSendTransactions,
  batchParallelInstructionsWithPriorityFee,
} from "@helium/spl-utils";
import { init as initState } from "@helium/state-controller-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
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
    let closedProposals = new Set();
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

      const proposalsNow = await Promise.all(
        proposalKeys.map(async (p) => ({
          account: await proposalProgram.account.proposalV0.fetch(p),
          pubkey: p,
        }))
      );
      for (const proposal of proposalsNow) {
        if (typeof proposal.account.state.voting === "undefined") {
          closedProposals.add(proposal.pubkey.toBase58());
        }
      }
      await batchParallelInstructionsWithPriorityFee(
        provider,
        resolveIxs
      );
    }

    const markers = (await vsrProgram.account.voteMarkerV0.all()).filter(
      (m) =>
        closedProposals.has(m.account.proposal.toBase58())
    );
    const limit = pLimit(100);
    const relinquishIxns = await Promise.all(
      markers
        .filter(
          (marker) => !marker.account.rentRefund.equals(PublicKey.default)
        )
        .map((marker) =>
          limit(async () => {
            return await vsrProgram.methods
              .relinquishExpiredVoteV0()
              .accountsStrict({
                marker: marker.publicKey,
                position: positionKey(marker.account.mint)[0],
                proposal: marker.account.proposal,
                systemProgram: SystemProgram.programId,
                rentRefund: marker.account.rentRefund,
              })
              .instruction();
          })
        )
    );
    await batchParallelInstructionsWithPriorityFee(provider, relinquishIxns);

    process.exit(0);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
})();
