import * as anchor from "@coral-xyz/anchor";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
import {
  init as initOrg,
  organizationKey,
  proposalKey,
} from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  batchParallelInstructionsWithPriorityFee,
  populateMissingDraftInfo,
  sendAndConfirmWithRetry,
  toVersionedTx,
  truthy,
} from "@helium/spl-utils";
import { init as initState } from "@helium/state-controller-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import pLimit from "p-limit";

async function getSolanaUnixTimestamp(
  provider: anchor.AnchorProvider
): Promise<bigint> {
  const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}

(async () => {
  try {
    if (!process.env.ANCHOR_WALLET)
      throw new Error("ANCHOR_WALLET not provided");

    if (!process.env.SOLANA_URL) throw new Error("SOLANA_URL not provided");

    process.env.ANCHOR_PROVIDER_URL = process.env.SOLANA_URL;
    anchor.setProvider(anchor.AnchorProvider.local(process.env.SOLANA_URL));

    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const conn = provider.connection;
    new AccountFetchCache({
      connection: conn,
      commitment: "confirmed",
      extendConnection: true,
    });
    const orgProgram = await initOrg(provider);
    const stateProgram = await initState(provider);
    const proposalProgram = await initProposal(provider);
    const vsrProgram = await initVsr(provider);
    const proxyProgram = await initNftProxy(provider);
    const solanaTime = await getSolanaUnixTimestamp(provider);
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
            .accountsPartial({
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
      await batchParallelInstructionsWithPriorityFee(provider, resolveIxs);
    }

    const markers = (await vsrProgram.account.voteMarkerV0.all()).filter((m) =>
      closedProposals.has(m.account.proposal.toBase58())
    );
    const limit = pLimit(100);
    console.log(`Relinquishing ${markers.length} expired vote markers`);
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

    const proxyAssignments = await proxyProgram.account.proxyAssignmentV0.all();
    const expiredProxyAssignments = proxyAssignments.filter((pa) => {
      const { account } = pa;
      return account.expirationTime.lt(new anchor.BN(Number(solanaTime)));
    });

    const proxyAssignmentsByAsset: {
      [key: string]: (typeof proxyAssignments)[0][];
    } = expiredProxyAssignments.reduce(
      (acc, assignment) => ({
        ...acc,
        [assignment.account.asset.toBase58()]: [
          ...(acc[assignment.account.asset.toBase58()] || []),
          assignment,
        ],
      }),
      {} as {
        [key: string]: (typeof proxyAssignments)[0][];
      }
    );

    const multiDimArray: TransactionInstruction[][] = await Promise.all(
      Object.entries(proxyAssignmentsByAsset).map(async ([_, proxies], idx) => {
        const sortedProxies = proxies.sort((a, b) =>
          a.account.index < b.account.index ? 1 : -1
        );

        return (await Promise.all(
          sortedProxies.map(async (proxy, index) => {
            if (proxy.account.index === 0) {
              return proxyProgram.methods
                .closeExpiredProxyV0()
                .accountsPartial({
                  proxyAssignment: new PublicKey(proxy.publicKey),
                })
                .instruction();
            }

            if (proxy.account.index !== 0 && sortedProxies[index + 1]) {
              const prevProxyAssignment = new PublicKey(
                sortedProxies[index + 1].publicKey
              );

              return proxyProgram.methods
                .unassignExpiredProxyV0()
                .accountsPartial({
                  prevProxyAssignment,
                  proxyAssignment: new PublicKey(proxy.publicKey),
                })
                .instruction();
            }
          })
        )).filter(truthy);
      })
    );

    const txs = await batchInstructionsToTxsWithPriorityFee(
      provider,
      multiDimArray
    );

    for (const tx of txs) {
      const fullDraft = await populateMissingDraftInfo(conn, tx);
      const versionedTx = toVersionedTx(fullDraft);
      const signed = await provider.wallet.signTransaction(versionedTx);
      await sendAndConfirmWithRetry(
        conn,
        Buffer.from(signed.serialize()),
        { skipPreflight: true },
        "confirmed"
      );
    }

    process.exit(0);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
})();
