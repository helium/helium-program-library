import dotenv from "dotenv";
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
import { init, lazyDistributorKey, PROGRAM_ID } from "@helium/lazy-distributor-sdk";
import { AccountFetchCache, Asset, getAsset, HNT_MINT, IOT_MINT } from "@helium/spl-utils";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { Op } from "sequelize";
import fs from "fs";
import { Reward } from "./model";
import Fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import cors from "@fastify/cors";
import { getLeafAssetId } from "@metaplex-foundation/mpl-bubblegum";

const HNT = process.env.HNT_MINT ? new PublicKey(process.env.HNT_MINT) : HNT_MINT;
const DAO = daoKey(HNT)[0];
const ENTITY_CREATOR = entityCreatorKey(DAO)[0];

export interface Database {
  getCurrentRewards: (asset: PublicKey) => Promise<string>;
  getBulkRewards: (entityKeys: string[]) => Promise<Record<string, string>>;
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

  async getBulkRewards(entityKeys: string[]): Promise<Record<string, string>> {
    const rewards = await Reward.findAll({
      where: {
        address: {
          [Op.in]: entityKeys
        }
      }
    })

    return rewards.map(rew => [rew.address, rew.rewards]).reduce((acc, [key, val]) => {
      // TODO: Remove when 6 decimals
      acc[key] = new BN(val).div(new BN(100)).toString();
      return acc;
    }, {} as Record<string, string>)
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
    if (!asset.creators[0].verified || !new PublicKey(asset.creators[0].address).equals(ENTITY_CREATOR)) {
      throw new Error("Not a valid rewardable entity")
    }
    const reward = await Reward.findByPk(eccCompact) as Reward;

    // TODO: Remove when 6 decimals
    return new BN(reward?.rewards).div(new BN(100)).toString() || "0";
  };
}

export class OracleServer {
  app: FastifyInstance;
  port = 8080;
  server: string | undefined;

  constructor(
    public program: Program<LazyDistributor>,
    public hemProgram: Program<HeliumEntityManager>,
    private oracle: Keypair,
    public db: Database,
    readonly lazyDistributor: PublicKey
  ) {
    const server: FastifyInstance = Fastify({
      logger: true,
    });
    server.register(cors, {
      origin: "*",
    });
    server.get("/health", async () => {
      return { ok: true };
    });

    this.app = server;
    this.addRoutes();
  }

  public async start() {
    this.server = await this.app.listen({
      port: this.port, 
      host: "0.0.0.0"
    });
    console.log(`Oracle server listening on port ${this.port}`);
  }

  public async close() {
    await this.app.close();
  }

  private addRoutes() {
    this.app.post("/bulk-rewards", this.getAllRewardsHandler.bind(this));
    this.app.get<{ Querystring: { assetId?: string; entityKey?: string } }>(
      "/",
      this.getCurrentRewardsHandler.bind(this)
    );
    this.app.post("/", this.signTransactionHandler.bind(this));
  }

  private async getCurrentRewardsHandler(
    req: FastifyRequest<{ Querystring: { assetId?: string; entityKey?: string } }>,
    res: FastifyReply
  ) {
    let assetId = req.query.assetId as string;
    let entityKey = req.query.entityKey as string;
    if (!assetId && !entityKey) {
      res
        .status(400)
        .send({
          error: "Must provide either `entityKey` or `assetId` parameter",
        });
      return;
    }

    if (entityKey) {
      const [key] = await keyToAssetKey(DAO, entityKey as string);
      const keyToAsset = await this.hemProgram.account.keyToAssetV0.fetch(key);
      assetId = keyToAsset.asset.toBase58();
    }
    let asset: PublicKey;
    try {
      asset = new PublicKey(assetId);
    } catch (err) {
      res.status(400).send({ error: "Invalid asset id" });
      return;
    }

    const currentRewards = await this.db.getCurrentRewards(asset);

    res.send({
      currentRewards,
    });
  }

  private async getAllRewardsHandler(req: FastifyRequest<{ Body: { entityKeys: string[] } }>, res: FastifyReply) {
    const entityKeys: string[] = req.body.entityKeys;

    if (!entityKeys) {
      res.status(400).send({ error: "No entityKeys field" });
      return;
    }

    const currentRewards = await this.db.getBulkRewards(entityKeys);
    res.send({
      currentRewards,
    });
  }

  private async signTransactionHandler(req: FastifyRequest<{ Body: { transaction: { data: number[] }  } }>, res: FastifyReply) {
    if (!req.body.transaction) {
      res.status(400).send({ error: "No transaction field" });
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
    const initCompressionRecipientTx = this.program.idl.instructions.find(
      (x) => x.name === "initializeCompressionRecipientV0"
    )!;
    const lazyDistributorIdxInitRecipient = initRecipientTx.accounts.findIndex(
      (x) => x.name === "lazyDistributor"
    )!;
    const lazyDistributorIdxInitCompressionRecipient = initCompressionRecipientTx.accounts.findIndex(
      (x) => x.name === "lazyDistributor"
    )!;
    const mintIdx = initRecipientTx.accounts.findIndex(
      (x) => x.name === "mint"
    )!;
    const merkleTreeIdxInitCompressionRecipient =
      initCompressionRecipientTx.accounts.findIndex(
        (x) => x.name === "merkleTree"
      )!;
    const recipientIdxInitRecipient = initRecipientTx.accounts.findIndex(
      (x) => x.name === "recipient"
    )!;
    const recipientIdxInitCompressionRecipient = initCompressionRecipientTx.accounts.findIndex(
      (x) => x.name === "recipient"
    )!;

    for (const ix of tx.instructions) {
      if (!ix.programId.equals(PROGRAM_ID)) {
        res.status(400).send({ error: "Invalid instructions in transaction" });
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
          decoded.name !== "initializeRecipientV0" &&
          decoded.name !== "initializeCompressionRecipientV0")
      ) {
        res.status(400).send({ error: "Invalid instructions in transaction" });
        return;
      }

      if (decoded.name === "setCurrentRewardsV0") setRewardIxs.push(ix);

      // Since recipient wont exist to fetch to get the mint id, grab it from the init recipient ix
      if (decoded.name === "initializeRecipientV0") {
        const recipient = ix.keys[recipientIdxInitRecipient].pubkey.toBase58();
        recipientToLazyDistToMint[recipient] ||= {};
        const lazyDist =
          ix.keys[lazyDistributorIdxInitRecipient].pubkey.toBase58();
        recipientToLazyDistToMint[recipient][lazyDist] =
          ix.keys[mintIdx].pubkey;
      }

      // Since recipient wont exist to fetch to get the asset id, grab it from the init recipient ix
      if (decoded.name === "initializeCompressionRecipientV0") {
        const recipient =
          ix.keys[recipientIdxInitCompressionRecipient].pubkey.toBase58();
        recipientToLazyDistToMint[recipient] ||= {};
        const lazyDist =
          ix.keys[lazyDistributorIdxInitCompressionRecipient].pubkey.toBase58();
        const merkleTree =
          ix.keys[merkleTreeIdxInitCompressionRecipient].pubkey;

        const index = (decoded.data as any).args.index
        recipientToLazyDistToMint[recipient][lazyDist] =
          (await getLeafAssetId(merkleTree, new BN(index)));
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

        if (!lazyDist.equals(this.lazyDistributor)) {
          res.status(400).send({ error: "Invalid lazy distributor" });
        }

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
          res.status(400).send({ error: "Invalid amount" });
          return;
        }
      }
    }

    // validate that this oracle is not the fee payer
    if (tx.feePayer?.equals(this.oracle.publicKey)) {
      res
        .status(400)
        .send({ error: "Cannot set this oracle as the fee payer" });
      return;
    }

    tx.partialSign(this.oracle);

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.send({ success: true, transaction: serialized });
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
    const DNT = process.env.DNT_MINT
      ? new PublicKey(process.env.DNT_MINT)
      : IOT_MINT;
    const LAZY_DISTRIBUTOR = lazyDistributorKey(DNT)[0];
    const server = new OracleServer(
      program,
      hemProgram,
      oracleKeypair,
      new PgDatabase(hemProgram),
      LAZY_DISTRIBUTOR
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
