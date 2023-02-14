import dotenv from "dotenv";
import express, { Application, Request, Response } from "express";
dotenv.config();
// @ts-ignore
import {
  AnchorProvider,
  BN,
  BorshInstructionCoder,
  getProvider,
  Program,
  setProvider
} from "@coral-xyz/anchor";
import { entityCreatorKey, init as initHeliumEntityManager, keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  HeliumEntityManager
} from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { init, PROGRAM_ID } from "@helium/lazy-distributor-sdk";
import { AccountFetchCache, Asset, getAsset, HNT_MINT } from "@helium/spl-utils";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import { Reward } from "./model";

const HNT = process.env.HNT_MINT ? new PublicKey(process.env.HNT_MINT) : HNT_MINT;
const DAO = daoKey(HNT)[0];
const ENTITY_CREATOR = entityCreatorKey(DAO)[0];

export interface Database {
  getCurrentRewards: (asset: PublicKey) => Promise<string>;
}


export class PgDatabase implements Database {
  constructor(
    readonly issuanceProgram: Program<HeliumEntityManager>,
    readonly getAssetFn: (
      url: string,
      asset: PublicKey
    ) => Promise<Asset | undefined> = getAsset
  ) {
  }

  async getCurrentRewards(assetId: PublicKey) {
    const asset = await this.getAssetFn(
      // @ts-ignore
      process.env.ASSET_API_URL || this.issuanceProgram.provider.connection._rpcEndpoint,
      assetId
    );
    if (!asset) {
      console.error("No asset found", assetId.toBase58());
      return "0";
    }
    const eccCompact = asset.content.json_uri.split("/").slice(-1)[0] as string;
    // Verify the creator is our entity creator, otherwise they could just
    // pass in any NFT with this ecc compact to collect rewards
    if (!asset.creators[0].verified || !asset.creators[0].address.equals(ENTITY_CREATOR)) {
      throw new Error("Not a valid rewardable entity")
    }
    const reward = await Reward.findByPk(eccCompact) as Reward;

    // TODO: Remove when 6 decimals
    return new BN(reward?.rewards).div(new BN(100)).toString() || "0";
  };
}

export class OracleServer {
  app: Application;
  port = 8080;
  private server: any;

  constructor(
    public program: Program<LazyDistributor>,
    private oracle: Keypair,
    public db: Database
  ) {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json());
    this.app = app;
    this.addRoutes();
  }

  public start() {
    this.server = this.app.listen(this.port, "0.0.0.0", () => {
      console.log(`server started at http://0.0.0.0:${this.port}`);
    });
  }

  public close() {
    this.server.close();
  }

  private addRoutes() {
    this.app.get("/", this.getCurrentRewardsHandler.bind(this));
    this.app.get("/health", (req: Request, res: Response) =>
      res.json({ ok: true })
    );
    this.app.post("/", this.signTransactionHandler.bind(this));
  }

  private async getCurrentRewardsHandler(req: Request, res: Response) {
    const assetId = req.query.assetId;
    if (!assetId) {
      res.status(400).json({ error: "No asset id provided" });
      return;
    }
    let asset: PublicKey;
    try {
      asset = new PublicKey(assetId);
    } catch (err) {
      res.status(400).json({ error: "Invalid asset id" });
      return;
    }

    const currentRewards = await this.db.getCurrentRewards(asset);

    res.json({
      currentRewards,
    });
  }

  private async signTransactionHandler(req: Request, res: Response) {
    if (!req.body.transaction) {
      res.status(400).json({ error: "No transaction field" });
      return;
    }

    const tx = Transaction.from(req.body.transaction.data);

    // validate only interacts with LD program and only calls setCurrentRewards and distributeRewards
    const setRewardIxs: TransactionInstruction[] = [];
    let recipientToLazyDistToMint: Record<
      string,
      Record<string, PublicKey>
    > = {};
    const initRecipientTx = this.program.idl.instructions.find(
      (x) => x.name === "initializeRecipientV0"
    )!;
    const lazyDistributorIdxInitRecipient = initRecipientTx.accounts.findIndex(
      (x) => x.name === "lazyDistributor"
    )!;
    const mintIdx = initRecipientTx.accounts.findIndex(
      (x) => x.name === "mint"
    )!;
    const recipientIdxInitRecipient = initRecipientTx.accounts.findIndex(
      (x) => x.name === "recipient"
    )!;
    for (const ix of tx.instructions) {
      if (!ix.programId.equals(PROGRAM_ID)) {
        res.status(400).json({ error: "Invalid instructions in transaction" });
        return;
      }
      let decoded = (
        this.program.coder.instruction as BorshInstructionCoder
      ).decode(ix.data);
      if (
        !decoded ||
        (decoded.name !== "setCurrentRewardsV0" &&
          decoded.name !== "distributeRewardsV0" &&
          decoded.name !== "distributeCompressionRewardsV0" &&
          decoded.name !== "initializeRecipientV0")
      ) {
        res.status(400).json({ error: "Invalid instructions in transaction" });
        return;
      }
      if (decoded.name === "setCurrentRewardsV0") setRewardIxs.push(ix);

      if (decoded.name === "initializeRecipientV0") {
        const recipient = ix.keys[recipientIdxInitRecipient].pubkey.toBase58();
        recipientToLazyDistToMint[recipient] ||= {};
        const lazyDist =
          ix.keys[lazyDistributorIdxInitRecipient].pubkey.toBase58();
        recipientToLazyDistToMint[recipient][lazyDist] =
          ix.keys[mintIdx].pubkey;
      }
    }

    const setRewardsIx = this.program.idl.instructions.find(
      (x) => x.name === "setCurrentRewardsV0"
    )!;
    const payerKeyIdx = setRewardsIx.accounts.findIndex(
      (x) => x.name === "payer"
    )!;
    const oracleKeyIdx = setRewardsIx.accounts.findIndex(
      (x) => x.name === "oracle"
    )!;
    const lazyDistIdx = setRewardsIx.accounts.findIndex(
      (x) => x.name === "lazyDistributor"
    )!;
    const recipientIdx = setRewardsIx.accounts.findIndex(
      (x) => x.name === "recipient"
    )!;
    // validate setRewards value for this oracle is correct
    for (const ix of setRewardIxs) {
      if (ix.keys[oracleKeyIdx].pubkey.equals(this.oracle.publicKey)) {
        let decoded = (
          this.program.coder.instruction as BorshInstructionCoder
        ).decode(ix.data);

        const recipient = ix.keys[recipientIdx].pubkey;
        const lazyDist = ix.keys[lazyDistIdx].pubkey;
        let mint = (recipientToLazyDistToMint[recipient.toBase58()] || {})[
          lazyDist.toBase58()
        ];
        if (!mint) {
          const recipientAcc = await this.program.account.recipientV0.fetch(
            recipient
          );
          mint = recipientAcc.asset;
        }

        const currentRewards = await this.db.getCurrentRewards(mint);
        // @ts-ignore
        if (decoded.data.args.currentRewards.toNumber() > currentRewards) {
          res.status(400).json({ error: "Invalid amount" });
          return;
        }
      }
    }

    // validate that this oracle is not the fee payer
    if (tx.feePayer?.equals(this.oracle.publicKey)) {
      res
        .status(400)
        .json({ error: "Cannot set this oracle as the fee payer" });
      return;
    }

    tx.partialSign(this.oracle);

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.json({ success: true, transaction: serialized });
  }
}

(async function () {
  if (process.argv.length > 2 && process.argv[2] == "serve") {
    // driver code for running server
    setProvider(AnchorProvider.env());
    const provider = getProvider() as AnchorProvider;
    const oracleKeypair = Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(
          fs
            .readFileSync(
              (process.env.ORACLE_KEYPAIR_PATH || process.env.ANCHOR_WALLET)!
            )
            .toString()
        )
      )
    );
    const program = await init(provider);
    const hemProgram = await initHeliumEntityManager(provider);
    const server = new OracleServer(
      program,
      oracleKeypair,
      new PgDatabase(hemProgram)
    );
    // For performance
    new AccountFetchCache({
      connection: provider.connection,
      commitment: "confirmed",
      extendConnection: true,
    });
    server.start();
  }
})();
