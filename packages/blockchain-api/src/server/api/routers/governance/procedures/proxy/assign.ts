import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  requirePositionOwnershipWithMessage,
  buildBatchedTransactions,
  TASK_QUEUE,
} from "../helpers";
import type { InstructionGroup } from "../helpers";
import { delegatedPositionKey } from "@helium/helium-sub-daos-sdk";
import { init as initProxy, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  init as initOrg,
  organizationKey,
  proposalKey,
} from "@helium/organization-sdk";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  customSignerKey,
  nextAvailableTaskIds,
  taskKey,
  taskQueueAuthorityKey,
  init as initTuktuk,
} from "@helium/tuktuk-sdk";
import {
  init as initVsr,
  positionKey,
  proxyVoteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";

export const assign = publicProcedure.governance.assignProxies.handler(
  async ({ input, errors }) => {
    const { walletAddress, positionMints, proxyKey, expirationTime } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const proxyKeyPubkey = new PublicKey(proxyKey);
    const expirationTimeBN = new BN(expirationTime);

    const vsrProgram = await initVsr(provider);
    const proxyProgram = await initProxy(provider);
    const orgProgram = await initOrg(provider);
    const proposalProgram = await initProposal(provider);
    const hplCronsProgram = await initHplCrons(provider);
    const tuktukProgram = await initTuktuk(provider);

    const hntOrg = organizationKey("Helium")[0];
    const organization = await orgProgram.account.organizationV0.fetchNullable(
      hntOrg
    );

    type ProposalVoteData = {
      proposalPubkey: PublicKey;
      proxyMarkerPubkey: PublicKey;
    };

    let activeProxyVotes: ProposalVoteData[] = [];

    if (organization) {
      const proposalKeys = Array(Math.min(10, organization.numProposals))
        .fill(0)
        .map(
          (_, index) =>
            proposalKey(hntOrg, organization.numProposals - index - 1)[0]
        );

      const proposals = (
        await proposalProgram.account.proposalV0.fetchMultiple(proposalKeys)
      )
        .map((account, index) => ({ account, pubkey: proposalKeys[index] }))
        .filter(
          (p): p is typeof p & { account: NonNullable<typeof p.account> } =>
            !!p.account?.state.voting
        );

      if (proposals.length > 0) {
        const proxyVoteKeys = proposals.map(
          (p) => proxyVoteMarkerKey(proxyKeyPubkey, p.pubkey)[0]
        );
        const proxyVoteAccounts =
          await vsrProgram.account.proxyMarkerV0.fetchMultiple(proxyVoteKeys);

        for (let i = 0; i < proposals.length; i++) {
          const proxyMarkerAcc = proxyVoteAccounts[i];
          if (!proxyMarkerAcc || proxyMarkerAcc.choices.length === 0) continue;

          activeProxyVotes.push({
            proposalPubkey: proposals[i].pubkey,
            proxyMarkerPubkey: proxyVoteKeys[i],
          });
        }
      }
    }

    const allInstructions: TransactionInstruction[][] = [];
    const registrarCache = new Map<
      string,
      Awaited<ReturnType<typeof vsrProgram.account.registrar.fetch>>
    >();

    // Whether any position being assigned is delegated. The proxy's votes can
    // only be propagated to delegated positions, so we only kick the proxy-vote
    // cron when at least one delegated position is in this assignment.
    let hasDelegatedAssignment = false;

    for (const positionMint of positionMints) {
      const positionMintPubkey = new PublicKey(positionMint);
      const [positionPubkey] = positionKey(positionMintPubkey);

      const positionAcc = await vsrProgram.account.positionV0.fetchNullable(
        positionPubkey
      );

      if (!positionAcc) {
        throw errors.NOT_FOUND({
          message: `Position ${positionMint} not found`,
        });
      }

      await requirePositionOwnershipWithMessage(
        connection,
        positionMintPubkey,
        walletPubkey,
        positionMint,
        errors
      );

      const registrarKey = positionAcc.registrar.toBase58();
      let registrar = registrarCache.get(registrarKey);
      if (!registrar) {
        registrar = await vsrProgram.account.registrar.fetch(
          positionAcc.registrar
        );
        registrarCache.set(registrarKey, registrar);
      }

      const proxyConfig = registrar.proxyConfig;
      const ownedAssetProxyAssignmentAddress = proxyAssignmentKey(
        proxyConfig,
        positionMintPubkey,
        PublicKey.default
      )[0];

      const existingProxyAssignment =
        await proxyProgram.account.proxyAssignmentV0.fetchNullable(
          ownedAssetProxyAssignmentAddress
        );

      const instructions: TransactionInstruction[] = [];

      if (
        existingProxyAssignment &&
        !existingProxyAssignment.nextVoter.equals(PublicKey.default) &&
        !existingProxyAssignment.nextVoter.equals(proxyKeyPubkey)
      ) {
        const chain: { address: PublicKey; voter: PublicKey }[] = [];
        let currentVoter = existingProxyAssignment.nextVoter;
        while (!currentVoter.equals(PublicKey.default)) {
          const addr = proxyAssignmentKey(
            proxyConfig,
            positionMintPubkey,
            currentVoter
          )[0];
          chain.push({ address: addr, voter: currentVoter });
          const acc =
            await proxyProgram.account.proxyAssignmentV0.fetchNullable(addr);
          if (!acc) break;
          currentVoter = acc.nextVoter;
        }

        for (let i = chain.length - 1; i >= 0; i--) {
          const prevAddress =
            i === 0 ? ownedAssetProxyAssignmentAddress : chain[i - 1].address;

          instructions.push(
            await proxyProgram.methods
              .unassignProxyV0()
              .accountsPartial({
                asset: positionMintPubkey,
                prevProxyAssignment: prevAddress,
                currentProxyAssignment: ownedAssetProxyAssignmentAddress,
                proxyAssignment: chain[i].address,
                voter: PublicKey.default,
                approver: walletPubkey,
                tokenAccount: getAssociatedTokenAddressSync(
                  positionMintPubkey,
                  walletPubkey
                ),
              })
              .instruction()
          );
        }
      }

      const { instruction: assignInstruction } = await proxyProgram.methods
        .assignProxyV0({ expirationTime: expirationTimeBN })
        .accountsPartial({
          asset: positionMintPubkey,
          recipient: proxyKeyPubkey,
          proxyConfig,
          voter: PublicKey.default,
          approver: walletPubkey,
          tokenAccount: getAssociatedTokenAddressSync(
            positionMintPubkey,
            walletPubkey
          ),
        })
        .prepare();

      instructions.push(assignInstruction);

      if (activeProxyVotes.length > 0) {
        const [delegatedPosKey] = delegatedPositionKey(positionPubkey);
        const isDelegated = !!(await connection.getAccountInfo(
          delegatedPosKey
        ));
        if (isDelegated) {
          hasDelegatedAssignment = true;
        }
      }

      allInstructions.push(instructions);
    }

    // If the proxy has already voted on an active proposal, that vote was cast
    // before these positions were delegated to it, so the newly delegated
    // positions aren't covered. Queueing a proxy-vote task lets the
    // vote-service cron count the votes for them and schedule each marker's
    // relinquish via the task-queue PDA (the only signer authorized to do so).
    if (hasDelegatedAssignment && activeProxyVotes.length > 0) {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
        TASK_QUEUE
      );
      const nextAvailable = nextAvailableTaskIds(
        taskQueueAcc.taskBitmap,
        activeProxyVotes.length
      );
      const queueAuthority = PublicKey.findProgramAddressSync(
        [Buffer.from("queue_authority")],
        hplCronsProgram.programId
      )[0];

      const proxyVoteTaskInstructions: TransactionInstruction[] = [];
      for (const vote of activeProxyVotes) {
        if (nextAvailable.length === 0) {
          throw errors.BAD_REQUEST({ message: "No available task IDs" });
        }
        const freeTaskId = nextAvailable.pop()!;
        proxyVoteTaskInstructions.push(
          await hplCronsProgram.methods
            // @ts-ignore queueProxyVoteV0 is missing from the published IDL types
            .queueProxyVoteV0({ freeTaskId })
            .accountsPartial({
              marker: vote.proxyMarkerPubkey,
              task: taskKey(TASK_QUEUE, freeTaskId)[0],
              taskQueue: TASK_QUEUE,
              payer: walletPubkey,
              systemProgram: SystemProgram.programId,
              queueAuthority,
              tuktukProgram: tuktukProgram.programId,
              voter: proxyKeyPubkey,
              pdaWallet: customSignerKey(TASK_QUEUE, [
                Buffer.from("vote_payer"),
                proxyKeyPubkey.toBuffer(),
              ])[0],
              taskQueueAuthority: taskQueueAuthorityKey(
                TASK_QUEUE,
                queueAuthority
              )[0],
            })
            .instruction()
        );
      }

      allInstructions.push(proxyVoteTaskInstructions);
    }

    const groups: InstructionGroup[] = allInstructions
      .filter((i) => i.length > 0)
      .map((instructions) => ({
        instructions,
        metadata: {
          type: "proxy_assign",
          description: `Assign voting proxy to ${proxyKey.slice(0, 8)}...`,
        },
      }));

    if (groups.length === 0) {
      throw errors.BAD_REQUEST({
        message: "No proxy assignments to make",
      });
    }

    const { transactions, versionedTransactions, hasMore } =
      await buildBatchedTransactions({
        groups,
        connection,
        feePayer: walletPubkey,
      });

    const cluster = getCluster();
    const jitoTipCost =
      (cluster === "mainnet" || cluster === "mainnet-beta") &&
      versionedTransactions.length > 1
        ? getJitoTipAmountLamports()
        : 0;
    const totalFee =
      getTotalTransactionFees(versionedTransactions) + jitoTipCost;

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < totalFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: totalFee, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.PROXY_ASSIGN,
      walletAddress,
      proxyKey,
      positionCount: positionMints.length,
    });

    return {
      transactionData: {
        transactions,
        parallel: true,
        tag,
        actionMetadata: {
          type: "proxy_assign",
          proxyKey,
          positionCount: positionMints.length,
        },
      },
      hasMore,
      estimatedSolFee: await toTokenAmountOutput(
        new BN(totalFee),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
