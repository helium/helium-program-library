import { publicProcedure } from "../../../procedures";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import { init } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { helium } from "@helium/proto";
import Address from "@helium/address";
import {
  calculateRequiredBalance,
  getTransactionFee,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import axios from "axios";

// The ECC verifier is a required signer on IssueDataOnlyEntityV0. Only the ECC
// verifier service holds the private key; it co-signs after re-checking the
// gateway's ECC signature. This pubkey matches the one the on-chain program and
// the SDK resolver expect.
const ECC_VERIFIER = new PublicKey(
  "eccSAJM3tq7nQSpQTm8roxv4FPoipCkMsGizW2KBhqZ",
);

/**
 * Issue (mint) a data-only hotspot. Data-only hotspots are issued
 * permissionlessly through the data-only escrow — no maker is involved. We build
 * the IssueDataOnlyEntityV0 instruction locally and hand the unsigned
 * transaction to the ECC verifier, which validates the gateway's ECC key
 * signature and co-signs. The wallet then adds the owner signature and submits.
 */
export const issueDataOnlyHotspot =
  publicProcedure.hotspots.issueDataOnlyHotspot.handler(
    async ({ input, errors }) => {
      const { walletAddress, addGatewayTxn } = input;
      const owner = new PublicKey(walletAddress);
      const { connection, provider } = createSolanaConnection(walletAddress);

      let addGateway;
      try {
        addGateway = helium.blockchain_txn.decode(
          Buffer.from(addGatewayTxn, "base64"),
        ).addGateway;
      } catch {
        throw errors.BAD_REQUEST({
          message: "Invalid add-gateway transaction",
        });
      }
      if (
        !addGateway?.gateway?.length ||
        !addGateway.gatewaySignature?.length
      ) {
        throw errors.BAD_REQUEST({
          message: "Add-gateway transaction is missing the gateway signature",
        });
      }
      const gatewaySignature = addGateway.gatewaySignature;
      // The gateway is a Helium public key; its entity key is the base58 form.
      const entityKey = Address.fromBin(Buffer.from(addGateway.gateway)).b58;

      const program = await init(provider);
      const dao = daoKey(HNT_MINT)[0];

      const issueIx = await program.methods
        .issueDataOnlyEntityV0({
          entityKey: Buffer.from(bs58.decode(entityKey)),
        })
        .accountsPartial({
          payer: owner,
          recipient: owner,
          dao,
          eccVerifier: ECC_VERIFIER,
        })
        .instruction();

      // The ECC verifier deserializes the wire bytes as a (legacy)
      // VersionedTransaction and expects exactly two leading compute-budget
      // instructions before the issue instruction (it reads the issue at a fixed
      // index), so include both a unit-limit and a unit-price instruction.
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        issueIx,
      );
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner;

      // The message the gateway signed is the add-gateway proto with its
      // signatures cleared (matching AddGatewayV1.toProto(forSigning=true), which
      // is private). The verifier checks `signature` over `msg`, confirms it
      // matches the gateway key referenced in the transaction, and signs.
      const msg = helium.blockchain_txn_add_gateway_v1
        .encode({
          owner: addGateway.owner?.length ? addGateway.owner : null,
          gateway: addGateway.gateway,
          payer: addGateway.payer?.length ? addGateway.payer : null,
          stakingFee:
            addGateway.stakingFee && Number(addGateway.stakingFee) > 0
              ? addGateway.stakingFee
              : null,
          fee:
            addGateway.fee && Number(addGateway.fee) > 0
              ? addGateway.fee
              : null,
        })
        .finish();

      let eccSignedBytes: Buffer;
      try {
        const { data } = await axios.post(`${env.ECC_VERIFIER_URL}/verify`, {
          transaction: tx
            .serialize({ requireAllSignatures: false, verifySignatures: false })
            .toString("hex"),
          msg: Buffer.from(msg).toString("hex"),
          signature: Buffer.from(gatewaySignature).toString("hex"),
        });
        eccSignedBytes = Buffer.from(data.transaction, "hex");
      } catch (e) {
        const detail = axios.isAxiosError(e)
          ? JSON.stringify(e.response?.data) || e.message
          : e instanceof Error
            ? e.message
            : "unknown error";
        throw errors.BAD_REQUEST({
          message: `ECC verifier could not co-sign the issue transaction: ${detail}`,
        });
      }

      // The verifier returns the legacy transaction co-signed with the ECC
      // verifier key; the wallet fills the remaining owner signature.
      const eccSignedTx = VersionedTransaction.deserialize(eccSignedBytes);
      const totalFee = getTransactionFee(eccSignedTx);
      const walletBalance = await connection.getBalance(owner);
      const required = calculateRequiredBalance(totalFee, 0);
      if (walletBalance < required) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required, available: walletBalance },
        });
      }

      return {
        transactionData: {
          transactions: [
            {
              serializedTransaction: eccSignedBytes.toString("base64"),
              metadata: {
                type: "issue_data_only_hotspot",
                description: "Issue a data-only hotspot",
              },
            },
          ],
          parallel: false,
          tag: `issue_data_only_hotspot:${walletAddress}`,
          actionMetadata: { type: "issue_data_only_hotspot" },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(totalFee),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
