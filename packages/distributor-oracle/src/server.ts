import dotenv from "dotenv";
dotenv.config();
// @ts-ignore
import {
  AnchorProvider,
  BN,
  BorshInstructionCoder,
  getProvider,
  Instruction,
  Program,
  setProvider,
} from "@coral-xyz/anchor";
import {
  decodeEntityKey,
  entityCreatorKey,
  init as initHeliumEntityManager,
  keyToAssetKey,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import {
  init as initLazy,
  lazyDistributorKey,
  PROGRAM_ID as LD_PID,
} from "@helium/lazy-distributor-sdk";
import {
  init as initRewards,
  PROGRAM_ID as RO_PID,
} from "@helium/rewards-oracle-sdk";
import {
  Asset,
  getAsset,
  HNT_MINT,
  IOT_MINT,
  toNumber,
} from "@helium/spl-utils";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  VersionedTransaction,
  AddressLookupTableAccount,
  MessageCompiledInstruction,
} from "@solana/web3.js";
import { Op } from "sequelize";
import fs from "fs";
import { Reward, sequelize } from "./model";
import Fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import cors from "@fastify/cors";
import { getLeafAssetId } from "@metaplex-foundation/mpl-bubblegum";
import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import { register, totalRewardsGauge } from "./metrics";

const HNT = process.env.HNT_MINT
  ? new PublicKey(process.env.HNT_MINT)
  : HNT_MINT;
const DNT = process.env.DNT_MINT
  ? new PublicKey(process.env.DNT_MINT)
  : IOT_MINT;
const DAO = daoKey(HNT)[0];
const ENTITY_CREATOR = entityCreatorKey(DAO)[0];

export interface Database {
  getTotalRewards(): Promise<string>;
  getCurrentRewardsByEntity: (entityKey: string) => Promise<string>;
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

  async getTotalRewards(): Promise<string> {
    const totalRewards = (
      await Reward.findAll({
        attributes: [
          [sequelize.fn("SUM", sequelize.col("rewards")), "rewards"],
        ],
      })
    )[0].rewards;
    return totalRewards;
  }

  getActiveDevices(): Promise<number> {
    return Reward.count({
      where: {
        [Op.and]: [
          {
            lastReward: {
              [Op.gte]: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // Active within the last 30 days
            },
          },
          {
            [Op.or]: [
              {
                rewardType: "mobile_gateway",
              },
              {
                rewardType: "iot_gateway",
              },
            ],
          },
        ],
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
        this.issuanceProgram.provider.connection.rpcEndpoint,
      assetId
    );
    if (!asset) {
      console.error("No asset found", assetId.toBase58());
      return "0";
    }
    const keyToAssetKey = keyToAssetForAsset(asset, DAO);
    const keyToAsset = await this.issuanceProgram.account.keyToAssetV0.fetch(
      keyToAssetKey
    );
    const entityKey = decodeEntityKey(
      keyToAsset.entityKey,
      keyToAsset.keySerialization
    )!;
    // Verify the creator is our entity creator, otherwise they could just
    // pass in any NFT with this ecc compact to collect rewards
    if (
      !asset.creators[0].verified ||
      !new PublicKey(asset.creators[0].address).equals(ENTITY_CREATOR)
    ) {
      throw new Error("Not a valid rewardable entity");
    }

    return this.getCurrentRewardsByEntity(entityKey);
  }

  async getCurrentRewardsByEntity(entityKeyStr: string) {
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
    readonly lazyDistributor: PublicKey,
    readonly dao: PublicKey = DAO
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
    let lastCall = 0;
    async function getTotalRewards() {
      const currTs = new Date().valueOf();
      // Only update once every 10m
      if (currTs - lastCall > 10 * 60 * 1000) {
        console.log("Updating total rewards");
        const rewards = toNumber(new BN(await db.getTotalRewards()), 6);
        totalRewardsGauge.labels(DNT.toBase58()).set(Number(rewards));
        lastCall = currTs;
      }
    }
    server.get("/metrics", async (request, reply) => {
      await getTotalRewards();
      return register.metrics();
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
    this.app.get<{
      Querystring: {
        assetId?: string;
        entityKey?: string;
        keySerialization?: BufferEncoding | "b58";
      };
    }>("/", this.getCurrentRewardsHandler.bind(this));
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
      count,
    });
  }

  private async getCurrentRewardsHandler(
    req: FastifyRequest<{
      Querystring: {
        assetId?: string;
        entityKey?: string;
        keySerialization?: BufferEncoding | "b58";
      };
    }>,
    res: FastifyReply
  ) {
    let assetId = req.query.assetId as string;
    let entityKey = req.query.entityKey as string;
    let keySerialization = req.query.keySerialization;
    if (!keySerialization) {
      keySerialization = "b58";
    }
    if (!assetId && !entityKey) {
      res.status(400).send({
        error: "Must provide either `entityKey` or `assetId` parameter",
      });
      return;
    }

    if (entityKey) {
      const [key] = await keyToAssetKey(
        this.dao,
        entityKey as string,
        keySerialization
      );
      console.log(key.toBase58());
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

  private async signTransaction(
    data: number[]
  ): Promise<{ success: boolean; message?: string; transaction?: Buffer }> {
    console.log("data is", data)
    const conn = this.ldProgram.provider.connection;
    const tx = VersionedTransaction.deserialize(new Uint8Array(data));
    const LUTs = (
      await Promise.all(
        tx.message.addressTableLookups.map((acc) =>
          conn.getAddressLookupTable(acc.accountKey)
        )
      )
    )
      .map((lut) => lut.value)
      .filter((val) => val !== null) as AddressLookupTableAccount[];
    const allAccs = tx.message
      .getAccountKeys({ addressLookupTableAccounts: LUTs })
      .keySegments()
      .reduce((acc, cur) => acc.concat(cur), []);

    // validate only interacts with LD and RO programs and only calls setCurrentRewards, distributeRewards
    const setRewardIxs: MessageCompiledInstruction[] = [];
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

    for (const ix of tx.message.compiledInstructions) {
      const programId = allAccs[ix.programIdIndex];
      if (programId.equals(ComputeBudgetProgram.programId)) {
        continue;
      }
      if (!(programId.equals(LD_PID) || programId.equals(RO_PID))) {
        return {
          success: false,
          message: "Invalid instructions in transaction",
        };
      }
      const data = Buffer.from(ix.data);
      let decoded: Instruction | null;
      if (programId.equals(LD_PID)) {
        decoded = (
          this.ldProgram.coder.instruction as BorshInstructionCoder
        ).decode(data);
      } else {
        decoded = (
          this.roProgram.coder.instruction as BorshInstructionCoder
        ).decode(data);
      }
      if (
        !decoded ||
        (decoded.name !== "setCurrentRewardsV0" &&
          decoded.name !== "distributeRewardsV0" &&
          decoded.name !== "distributeCompressionRewardsV0" &&
          decoded.name !== "distributeCustomDestinationV0" &&
          decoded.name !== "initializeRecipientV0" &&
          decoded.name !== "initializeCompressionRecipientV0" &&
          decoded.name !== "setCurrentRewardsWrapperV0" &&
          decoded.name !== "setCurrentRewardsWrapperV1")
      ) {
        return {
          success: false,
          message: "Invalid instructions in transaction",
        };
      }

      console.log(decoded.name);

      if (
        decoded.name === "setCurrentRewardsV0" ||
        decoded.name === "setCurrentRewardsWrapperV0" ||
        decoded.name === "setCurrentRewardsWrapperV1"
      )
        setRewardIxs.push(ix);

      // Since recipient wont exist to fetch to get the mint id, grab it from the init recipient ix
      if (decoded.name === "initializeRecipientV0") {
        const recipient = allAccs[ix.accountKeyIndexes[recipientIdxInitRecipient]].toBase58();
        recipientToLazyDistToMint[recipient] ||= {};
        const lazyDist =
          allAccs[ix.accountKeyIndexes[lazyDistributorIdxInitRecipient]].toBase58();
        recipientToLazyDistToMint[recipient][lazyDist] =
          allAccs[ix.accountKeyIndexes[mintIdx]];
      }

      // Since recipient wont exist to fetch to get the asset id, grab it from the init recipient ix
      if (decoded.name === "initializeCompressionRecipientV0") {
        const recipient =
          allAccs[ix.accountKeyIndexes[recipientIdxInitCompressionRecipient]].toBase58();
        recipientToLazyDistToMint[recipient] ||= {};
        const lazyDist =
          allAccs[ix.accountKeyIndexes[lazyDistributorIdxInitCompressionRecipient]].toBase58();
        const merkleTree =
          allAccs[ix.accountKeyIndexes[merkleTreeIdxInitCompressionRecipient]];

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
      (x) =>
        x.name === "setCurrentRewardsWrapperV0" ||
        x.name === "setCurrentRewardsWrapperV1"
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
    const wrapperKeyToAssetIdx = setRewardsWrapperIx.accounts.findIndex(
      (x) => x.name === "keyToAsset"
    )!;
    // validate setRewards value for this oracle is correct
    for (const ix of setRewardIxs) {
      let recipient: PublicKey | undefined,
        lazyDist: PublicKey | undefined,
        proposedCurrentRewards: any;

      let entityKey: Buffer;
      let keyToAssetK: PublicKey | undefined = undefined;
      if (
        allAccs[ix.accountKeyIndexes[wrapperOracleKeyIdx]].equals(this.oracle.publicKey) &&
        allAccs[ix.programIdIndex].equals(RO_PID)
      ) {
        let decoded = (
          this.roProgram.coder.instruction as BorshInstructionCoder
        ).decode(Buffer.from(ix.data));

        recipient = allAccs[ix.accountKeyIndexes[wrapperRecipientIdx]];
        lazyDist = allAccs[ix.accountKeyIndexes[wrapperLazyDistIdx]];
        keyToAssetK = allAccs[ix.accountKeyIndexes[wrapperKeyToAssetIdx]];
        //@ts-ignore
        proposedCurrentRewards = decoded.data.args.currentRewards;
        entityKey = (
          await this.hemProgram.account.keyToAssetV0.fetch(keyToAssetK)
        ).entityKey;
        // A sneaky RPC could return incorrect data. Verify that the entity key is correct for the key to asset
        if (!keyToAssetKey(this.dao, entityKey)[0].equals(keyToAssetK)) {
          return {
            success: false,
            message: "RPC lied about the entity key for this asset.",
          };
        }
      } else if (
        allAccs[ix.accountKeyIndexes[oracleKeyIdx]].equals(this.oracle.publicKey) &&
        allAccs[ix.programIdIndex].equals(LD_PID)
      ) {
        let decoded = (
          this.ldProgram.coder.instruction as BorshInstructionCoder
        ).decode(Buffer.from(ix.data));

        recipient = allAccs[ix.accountKeyIndexes[recipientIdx]];
        lazyDist = allAccs[ix.accountKeyIndexes[lazyDistIdx]];
        //@ts-ignore
        proposedCurrentRewards = decoded.data.args.currentRewards;
      }

      if (!lazyDist || !recipient || !lazyDist.equals(this.lazyDistributor)) {
        return { success: false, message: "Invalid lazy distributor" };
      }

      let mint = (recipientToLazyDistToMint[recipient.toBase58()] || {})[
        lazyDist.toBase58()
      ];
      if (!mint) {
        const recipientAcc =
          await this.ldProgram.account.recipientV0.fetchNullable(recipient);
        if (!recipientAcc) {
          console.error(recipientToLazyDistToMint);
          return { success: false, message: "Recipient doesn't exist" };
        }
        mint = recipientAcc.asset;
      }
      let keySerialization: any = { b58: {} };
      if (keyToAssetK) {
        const keyToAsset = await this.hemProgram.account.keyToAssetV0.fetch(
          keyToAssetK
        );
        keySerialization = keyToAsset.keySerialization;
      }

      // @ts-ignore
      const currentRewards = entityKey
        ? await this.db.getCurrentRewardsByEntity(
            decodeEntityKey(entityKey, keySerialization)!
          )
        : await this.db.getCurrentRewards(mint);
      if (proposedCurrentRewards.gt(new BN(currentRewards))) {
        return {
          success: false,
          message: `Invalid amount, ${proposedCurrentRewards} is greater than actual rewards ${currentRewards}`,
        };
      }
    }

    // validate that this oracle is not the fee payer
    if (allAccs[0]?.equals(this.oracle.publicKey)) {
      return {
        success: false,
        message: "Cannot set this oracle as the fee payer",
      };
    }

    try {
      // It's valid to send txs that don't actually need to be signed by us. Happens sometimes with
      // tx packing.
      tx.sign([this.oracle]);
    } catch (e: any) {
      if (!e.message.toString().includes("Cannot sign with non signer key")) {
        throw e
      }
    }

    const serialized = tx.serialize();
    return { success: true, transaction: Buffer.from(serialized) };
  }

  private async signBulkTransactionsHandler(
    req: FastifyRequest<{ Body: { transactions: number[][] } }>,
    res: FastifyReply
  ) {
    if (!req.body.transactions) {
      res.status(400).send({ error: "No transactions field" });
      return;
    }

    let _this = this;
    const results = await Promise.all(
      req.body.transactions.map(async (txData) => {
        try {
          return await _this.signTransaction(txData);
        } catch (err: any) {
          console.error(err);
          return { success: false, message: err.message } as any;
        }
      })
    );

    const errIdx = results.findIndex((x) => !x.success);
    if (errIdx > -1) {
      res.status(400).send({
        error: results[errIdx].message
          ? `${results[errIdx].message}\n\nTransaction index: ${errIdx}`
          : `Error signing transaction index: ${errIdx}`,
      });
      return;
    }

    res.send({
      success: true,
      transactions: results.map((x) => x.transaction),
    });
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
      return
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
