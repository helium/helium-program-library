import dotenv from "dotenv";
import bs58 from "bs58";
dotenv.config();
// @ts-ignore
import {
  AnchorProvider,
  BN,
  BorshInstructionCoder,
  getProvider,
  Instruction,
  Program,
  setProvider
} from "@coral-xyz/anchor";
import { entityCreatorKey, init as initHeliumEntityManager, keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  HeliumEntityManager
} from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { init as initLazy, lazyDistributorKey, PROGRAM_ID as LD_PID } from "@helium/lazy-distributor-sdk";
import { init as initRewards, PROGRAM_ID as RO_PID} from "@helium/rewards-oracle-sdk";
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
import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import Address from "@helium/address";

const HNT = process.env.HNT_MINT ? new PublicKey(process.env.HNT_MINT) : HNT_MINT;
const DAO = daoKey(HNT)[0];
const ENTITY_CREATOR = entityCreatorKey(DAO)[0];

export interface Database {
  getCurrentRewardsByEntity: (entityKey: Buffer) => Promise<string>;
  getCurrentRewards: (asset: PublicKey) => Promise<string>;
  getBulkRewards: (entityKeys: string[]) => Promise<Record<string, string>>;
  getActiveDevices(): Promise<number>;
}


export class PgDatabase implements Database {
  constructor(
    readonly issuanceProgram: Program<HeliumEntityManager>,
    readonly getAssetFn: (
      url: string,
      asset: PublicKey
    ) => Promise<Asset | undefined> = getAsset
  ) {}

  getActiveDevices(): Promise<number> {
    return Reward.count({
      where: {
        lastReward: {
          [Op.gte]: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // Active within the last 30 days
        },
      },
    });
  }

  async getBulkRewards(entityKeys: string[]): Promise<Record<string, string>> {
    const rewards = await Reward.findAll({
      where: {
        address: {
          [Op.in]: entityKeys,
        },
      },
    });

    return rewards
      .map((rew) => [rew.address, rew.rewards])
      .reduce((acc, [key, val]) => {
        acc[key] = new BN(val).toString();
        return acc;
      }, {} as Record<string, string>);
  }

  async getCurrentRewards(assetId: PublicKey) {
    const asset = await this.getAssetFn(
      process.env.ASSET_API_URL ||
        // @ts-ignore
        this.issuanceProgram.provider.connection._rpcEndpoint,
      assetId
    );
    if (!asset) {
      console.error("No asset found", assetId.toBase58());
      return "0";
    }
    const eccCompact = asset.content.json_uri.split("/").slice(-1)[0] as string;
    // Verify the creator is our entity creator, otherwise they could just
    // pass in any NFT with this ecc compact to collect rewards
    if (
      !asset.creators[0].verified ||
      !new PublicKey(asset.creators[0].address).equals(ENTITY_CREATOR)
    ) {
      throw new Error("Not a valid rewardable entity");
    }

    return this.getCurrentRewardsByEntity(Buffer.from(bs58.decode(eccCompact)));
  }

  async getCurrentRewardsByEntity(entityKey: Buffer) {
    const encoded = bs58.encode(entityKey);
    const isHotspot = Address.isValid(encoded);
    const entityKeyStr = isHotspot ? encoded : entityKey.toString("utf-8");
    const reward = (await Reward.findByPk(entityKeyStr)) as Reward;

    return new BN(reward?.rewards).toString() || "0";
  }
}

export class OracleServer {
  app: FastifyInstance;
  port = 8080;
  server: string | undefined;

  constructor(
    public ldProgram: Program<LazyDistributor>,
    public roProgram: Program<RewardsOracle>,
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
      host: "0.0.0.0",
    });
    console.log(`Oracle server listening on port ${this.port}`);
  }

  public async close() {
    await this.app.close();
  }

  private addRoutes() {
    this.app.get("/active-devices", this.getActiveDevicesHandler.bind(this));
    this.app.post("/bulk-rewards", this.getAllRewardsHandler.bind(this));
    this.app.get<{ Querystring: { assetId?: string; entityKey?: string } }>(
      "/",
      this.getCurrentRewardsHandler.bind(this)
    );
    this.app.post("/", this.signTransactionHandler.bind(this));
    this.app.post("/bulk-sign", this.signBulkTransactionsHandler.bind(this));
  }

  private async getActiveDevicesHandler(
    req: FastifyRequest<{
      Querystring: { assetId?: string; entityKey?: string };
    }>,
    res: FastifyReply
  ) {
    const count = await this.db.getActiveDevices();

    res.send({
      count
    });
  }

  private async getCurrentRewardsHandler(
    req: FastifyRequest<{
      Querystring: { assetId?: string; entityKey?: string };
    }>,
    res: FastifyReply
  ) {
    let assetId = req.query.assetId as string;
    let entityKey = req.query.entityKey as string;
    if (!assetId && !entityKey) {
      res.status(400).send({
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

  private async getAllRewardsHandler(
    req: FastifyRequest<{ Body: { entityKeys: string[] } }>,
    res: FastifyReply
  ) {
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

  private async signTransaction(data: number[]): Promise<{ success: boolean; message?: string, transaction?: Buffer }> {
    const tx = Transaction.from(data);

    // validate only interacts with LD and RO programs and only calls setCurrentRewards, distributeRewards
    const setRewardIxs: TransactionInstruction[] = [];
    let recipientToLazyDistToMint: Record<
      string,
      Record<string, PublicKey>
    > = {};
    const initRecipientTx = this.ldProgram.idl.instructions.find(
      (x) => x.name === "initializeRecipientV0"
    )!;
    const initCompressionRecipientTx = this.ldProgram.idl.instructions.find(
      (x) => x.name === "initializeCompressionRecipientV0"
    )!;
    const lazyDistributorIdxInitRecipient = initRecipientTx.accounts.findIndex(
      (x) => x.name === "lazyDistributor"
    )!;
    const lazyDistributorIdxInitCompressionRecipient =
      initCompressionRecipientTx.accounts.findIndex(
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
    const recipientIdxInitCompressionRecipient =
      initCompressionRecipientTx.accounts.findIndex(
        (x) => x.name === "recipient"
      )!;

    for (const ix of tx.instructions) {
      if (!(ix.programId.equals(LD_PID) || ix.programId.equals(RO_PID))) {
        return {success: false, message: "Invalid instructions in transaction"};
      }
      let decoded: Instruction | null;
      if (ix.programId.equals(LD_PID)) {
        decoded = (
          this.ldProgram.coder.instruction as BorshInstructionCoder
        ).decode(ix.data);
      } else {
        decoded = (
          this.roProgram.coder.instruction as BorshInstructionCoder
        ).decode(ix.data);
      }
      if (
        !decoded ||
        (decoded.name !== "setCurrentRewardsV0" &&
          decoded.name !== "distributeRewardsV0" &&
          decoded.name !== "distributeCompressionRewardsV0" &&
          decoded.name !== "initializeRecipientV0" &&
          decoded.name !== "initializeCompressionRecipientV0" &&
          decoded.name !== "setCurrentRewardsWrapperV0")
      ) {
        return {success: false, message: "Invalid instructions in transaction"};
      }

      console.log(decoded.name)

      if (decoded.name === "setCurrentRewardsV0" || decoded.name === "setCurrentRewardsWrapperV0") setRewardIxs.push(ix);

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

        const index = (decoded.data as any).args.index;
        recipientToLazyDistToMint[recipient][lazyDist] = await getLeafAssetId(
          merkleTree,
          new BN(index)
        );
      }
    }

    const setRewardsIx = this.ldProgram.idl.instructions.find(
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

    const setRewardsWrapperIx = this.roProgram.idl.instructions.find(
      (x) => x.name === "setCurrentRewardsWrapperV0"
    )!;
    const wrapperOracleKeyIdx = setRewardsWrapperIx.accounts.findIndex(
      (x) => x.name === "oracle"
    )!;
    const wrapperLazyDistIdx = setRewardsWrapperIx.accounts.findIndex(
      (x) => x.name === "lazyDistributor"
    )!;
    const wrapperRecipientIdx = setRewardsWrapperIx.accounts.findIndex(
      (x) => x.name === "recipient"
    )!;
    // validate setRewards value for this oracle is correct
    for (const ix of setRewardIxs) {
      let recipient: PublicKey | undefined, lazyDist: PublicKey | undefined, proposedCurrentRewards: any;

      let entityKey;
      if (ix.keys[wrapperOracleKeyIdx].pubkey.equals(this.oracle.publicKey) && ix.programId.equals(RO_PID)) {
        let decoded = (
          this.roProgram.coder.instruction as BorshInstructionCoder
        ).decode(ix.data);

        recipient = ix.keys[wrapperRecipientIdx].pubkey;
        lazyDist = ix.keys[wrapperLazyDistIdx].pubkey;
        //@ts-ignore
        proposedCurrentRewards = decoded.data.args.currentRewards;
        // @ts-ignore
        entityKey = decoded.data.args.entityKey;
      } else if (ix.keys[oracleKeyIdx].pubkey.equals(this.oracle.publicKey) && ix.programId.equals(LD_PID)) {
        let decoded = (
          this.ldProgram.coder.instruction as BorshInstructionCoder
        ).decode(ix.data);

        recipient = ix.keys[recipientIdx].pubkey;
        lazyDist = ix.keys[lazyDistIdx].pubkey;
        //@ts-ignore
        proposedCurrentRewards = decoded.data.args.currentRewards;
      }

      if (!lazyDist || !recipient || !lazyDist.equals(this.lazyDistributor)) {
        return {success: false, message: "Invalid lazy distributor"};
      }

      let mint = (recipientToLazyDistToMint[recipient.toBase58()] || {})[
        lazyDist.toBase58()
      ];
      if (!mint) {
        const recipientAcc = await this.ldProgram.account.recipientV0.fetchNullable(
          recipient
        );
        if (!recipientAcc) {
          console.error(recipientToLazyDistToMint);
          return {success: false, message: "Recipient doesn't exist"};
        }
        mint = recipientAcc.asset;
      }

      const currentRewards = entityKey
        ? await this.db.getCurrentRewardsByEntity(entityKey)
        : await this.db.getCurrentRewards(mint);
      if (proposedCurrentRewards.toNumber() > currentRewards) {
        return {success: false, message: "Invalid amount"};
      }
    }

    // validate that this oracle is not the fee payer
    if (tx.feePayer?.equals(this.oracle.publicKey)) {
      return {success: false, message: "Cannot set this oracle as the fee payer"};
    }

    tx.partialSign(this.oracle);

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    return {success: true, transaction: serialized};
  }

  private async signBulkTransactionsHandler(
    req: FastifyRequest<{ Body: {transactions: { data: number[] }[] } }>,
    res: FastifyReply
  ) {
    if (!req.body.transactions) {
      res.status(400).send({ error: "No transactions field" });
      return;
    }

    let _this = this;
    const serializedTxs = await Promise.all(req.body.transactions.map(async (txData) => {
      const result = await _this.signTransaction(txData.data);
      return result.success ? result.transaction : result.message;
    }));
    console.log(serializedTxs);
    res.send({ success: true, transactions: serializedTxs });
  }

  private async signTransactionHandler(
    req: FastifyRequest<{ Body: { transaction: { data: number[] } } }>,
    res: FastifyReply
  ) {
    if (!req.body.transaction) {
      res.status(400).send({ error: "No transaction field" });
      return;
    }

    const result = await this.signTransaction(req.body.transaction.data);

    if (!result.success) {
      res
        .status(400)
        .send({ error: result.message || "Error signing transaction" });
    }

    res.send({ success: true, transaction: result.transaction });
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
    const ldProgram = await initLazy(provider);
    const roProgram = await initRewards(provider);
    const hemProgram = await initHeliumEntityManager(provider);
    const DNT = process.env.DNT_MINT
      ? new PublicKey(process.env.DNT_MINT)
      : IOT_MINT;
    const LAZY_DISTRIBUTOR = lazyDistributorKey(DNT)[0];
    const server = new OracleServer(
      ldProgram,
      roProgram,
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
