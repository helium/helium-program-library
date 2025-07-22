import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  RemoteTaskTransactionV0,
} from "@helium/tuktuk-sdk";
import dotenv from "dotenv";
import { sign } from "tweetnacl";
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
import cors from "@fastify/cors";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import {
  decodeEntityKey,
  init as initHeliumEntityManager,
  keyToAssetForAsset,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import {
  distributeCompressionRewards,
  initializeCompressionRecipient,
  init as initLazy,
  lazyDistributorKey,
  PROGRAM_ID as LD_PID,
  recipientKey,
} from "@helium/lazy-distributor-sdk";
import {
  init as initRewards,
  PROGRAM_ID as RO_PID,
} from "@helium/rewards-oracle-sdk";
import { Asset, getAsset, HNT_MINT, toNumber } from "@helium/spl-utils";
import { getLeafAssetId } from "@metaplex-foundation/mpl-bubblegum";
import { createMemoInstruction } from "@solana/spl-memo";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  MessageCompiledInstruction,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fs from "fs";
import {
  ATA_RENT,
  DAO,
  DNT,
  MAX_CLAIMS_PER_TX,
  RECIPIENT_RENT,
} from "./constants";
import { Database, DeviceType } from "./database";
import { register, totalRewardsGauge } from "./metrics";
import { KeyToAsset, Reward } from "./model";
import { PgDatabase } from "./pgDatabase";
export * from "./database";

export class OracleServer {
  app: FastifyInstance;
  port = 8080;
  server: string | undefined;

  constructor(
    // tuktuk is on a different version of anchor, so this has to be done.
    public tuktukProgram: any,
    public ldProgram: Program<LazyDistributor>,
    public roProgram: Program<RewardsOracle>,
    public hemProgram: Program<HeliumEntityManager>,
    public hplCronsProgram: any,
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
    this.app.get("/rewards", this.getRewardsHandler.bind(this));
    this.app.get(
      "/active-iot-devices",
      this.getActiveIotDevicesHandler.bind(this)
    );
    this.app.get(
      "/active-mobile-devices",
      this.getActiveMobileDevicesHandler.bind(this)
    );
    this.app.get("/active-devices", this.getActiveDevicesHandler.bind(this));
    this.app.post("/bulk-rewards", this.getAllRewardsHandler.bind(this));
    this.app.get(
      "/will-pay-recipient",
      (
        _req: FastifyRequest<{ Body: { entityKeys: string[] } }>,
        res: FastifyReply
      ) => {
        res.send({
          willPay: process.env.WILL_PAY_RECIPIENT === "true",
        });
      }
    );
    this.app.get<{
      Querystring: {
        assetId?: string;
        entityKey?: string;
        keySerialization?: BufferEncoding | "b58";
      };
    }>("/", this.getCurrentRewardsHandler.bind(this));
    this.app.post("/", this.signTransactionHandler.bind(this));
    this.app.post("/bulk-sign", this.signBulkTransactionsHandler.bind(this));
    this.app.post(
      "/v1/tuktuk/asset/:assetId",
      this.tuktukAssetHandler.bind(this)
    );
    this.app.post(
      "/v1/tuktuk/kta/:keyToAssetKey",
      this.tuktukKtaHandler.bind(this)
    );
    this.app.post(
      "/v1/tuktuk/wallet/:wallet",
      this.tuktukWalletHandler.bind(this)
    );
    this.app.post("/v1/sign", this.signHandler.bind(this));
  }

  private async getRewardsHandler(
    req: FastifyRequest<{
      Querystring: { owner?: string; destination?: string };
    }>,
    res: FastifyReply
  ) {
    const { owner, destination } = req.query;
    let rewards: { lifetime: string; pending: string } | null = null;

    if (owner) {
      rewards = await this.db.getRewardsByOwner(owner);
    } else if (destination) {
      rewards = await this.db.getRewardsByDestination(destination);
    } else {
      res.status(400).send({ error: "Must provide owner or destination" });
    }

    res.send(rewards);
  }

  private async getActiveIotDevicesHandler(
    req: FastifyRequest<{
      Querystring: { assetId?: string; entityKey?: string };
    }>,
    res: FastifyReply
  ) {
    const count = await this.db.getActiveDevices(DeviceType.IOT);

    res.send({
      count,
    });
  }

  private async getActiveMobileDevicesHandler(
    req: FastifyRequest<{
      Querystring: { assetId?: string; entityKey?: string };
    }>,
    res: FastifyReply
  ) {
    const count = await this.db.getActiveDevices(DeviceType.MOBILE);

    res.send({
      count,
    });
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
    console.log("data is", data);
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
    const payerIdxInitCompressionRecipient =
      initCompressionRecipientTx.accounts.findIndex((x) => x.name === "payer")!;
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
        const recipient =
          allAccs[ix.accountKeyIndexes[recipientIdxInitRecipient]].toBase58();
        recipientToLazyDistToMint[recipient] ||= {};
        const lazyDist =
          allAccs[
            ix.accountKeyIndexes[lazyDistributorIdxInitRecipient]
          ].toBase58();
        recipientToLazyDistToMint[recipient][lazyDist] =
          allAccs[ix.accountKeyIndexes[mintIdx]];
      }

      // Since recipient wont exist to fetch to get the asset id, grab it from the init recipient ix
      if (decoded.name === "initializeCompressionRecipientV0") {
        const recipient =
          allAccs[
            ix.accountKeyIndexes[recipientIdxInitCompressionRecipient]
          ].toBase58();
        recipientToLazyDistToMint[recipient] ||= {};
        const lazyDist =
          allAccs[
            ix.accountKeyIndexes[lazyDistributorIdxInitCompressionRecipient]
          ].toBase58();
        const merkleTree =
          allAccs[ix.accountKeyIndexes[merkleTreeIdxInitCompressionRecipient]];
        const payer =
          allAccs[
            ix.accountKeyIndexes[payerIdxInitCompressionRecipient]
          ].toBase58();

        if (
          process.env.WILL_PAY_RECIPIENT !== "true" &&
          payer === this.oracle.publicKey.toBase58()
        ) {
          return {
            success: false,
            message: "Cannot set this oracle as the payer",
          };
        }

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
        allAccs[ix.accountKeyIndexes[wrapperOracleKeyIdx]].equals(
          this.oracle.publicKey
        ) &&
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
        allAccs[ix.accountKeyIndexes[oracleKeyIdx]].equals(
          this.oracle.publicKey
        ) &&
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
        throw e;
      }
    }

    const serialized = tx.serialize();
    return { success: true, transaction: Buffer.from(serialized) };
  }

  private async signHandler(
    request: FastifyRequest<{
      Body: { keyToAssetKeys: string[] };
    }>,
    reply: FastifyReply
  ) {
    try {
      const keyToAssetKeys = request.body.keyToAssetKeys;
      const keyToAssets =
        await this.hemProgram.account.keyToAssetV0.fetchMultiple(
          keyToAssetKeys.map((key) => new PublicKey(key))
        );
      if (keyToAssets.some((keyToAsset) => !keyToAsset)) {
        reply.status(404).send({
          message: "Key to asset not found",
        });
        return;
      }
      const entityKeys = keyToAssets.map(
        (keyToAsset) =>
          decodeEntityKey(keyToAsset!.entityKey, keyToAsset!.keySerialization)!
      );

      const rewards = await this.db.getBulkRewards(entityKeys);
      const messages = keyToAssets.map((keyToAsset, index) => ({
        lazyDistributor: this.lazyDistributor,
        oracleIndex: process.env.ORACLE_INDEX
          ? parseInt(process.env.ORACLE_INDEX)
          : 0,
        currentRewards: new BN(rewards[entityKeys[index]]),
        asset: keyToAsset!.asset,
      }));
      const serializedMessages = await Promise.all(
        messages.map(async (message) =>
          this.ldProgram.coder.accounts.encode(
            "setCurrentRewardsTransactionV0",
            message
          )
        )
      );
      const resp = {
        oracle: this.oracle.publicKey.toBase58(),
        messages: serializedMessages.map((m, index) => ({
          serialized: m.toString("base64"),
          message: messages[index],
          signature: Buffer.from(
            sign.detached(Uint8Array.from(m), this.oracle.secretKey)
          ).toString("base64"),
        })),
      };
      reply.status(200).send(resp);
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: "Request failed",
      });
    }
  }

  private async tuktukAssetHandler(
    request: FastifyRequest<{
      Params: { assetId: string };
      Body: { task_queue: string; task: string; task_queued_at: number };
    }>,
    reply: FastifyReply
  ) {
    const taskQueue = new PublicKey(request.body.task_queue);
    const task = new PublicKey(request.body.task);
    const taskQueuedAt = new BN(request.body.task_queued_at);
    try {
      const asset = await getAsset(
        process.env.ASSET_API_URL ||
        this.ldProgram.provider.connection.rpcEndpoint,
        new PublicKey(request.params.assetId)
      );
      if (!asset) {
        reply.status(404).send({
          message: "Asset not found",
        });
        return;
      }
      const keyToAssetK = await keyToAssetForAsset(asset, this.dao);
      let keyToAsset = await KeyToAsset.findOne({
        where: {
          address: keyToAssetK.toBase58()
        }
      });
      if (!keyToAsset) {
        reply.status(404).send({
          message: "Key to asset not found",
        });
        return;
      }

      return this.handleKta(reply, asset, keyToAsset, taskQueue, task, taskQueuedAt);
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: "Request failed",
      });
    }
  }

  private async handleKta(reply: FastifyReply, asset: Asset, keyToAsset: KeyToAsset, taskQueue: PublicKey, task: PublicKey, taskQueuedAt: BN) {
    const [wallet, bump] = customSignerKey(taskQueue, [
      Buffer.from("claim_payer"),
      asset!.ownership.owner.toBuffer(),
    ]);
    const bumpBuffer = Buffer.alloc(1);
    bumpBuffer.writeUint8(bump);
    const recipient = recipientKey(this.lazyDistributor, new PublicKey(keyToAsset.asset!))[0];
    let recipientAcc = await this.ldProgram.account.recipientV0.fetchNullable(
      recipient
    );
    const balance =
      (await this.ldProgram.provider.connection.getAccountInfo(wallet))
        ?.lamports || 0;

    const ata = getAssociatedTokenAddressSync(
      HNT_MINT,
      !recipientAcc || recipientAcc.destination.equals(PublicKey.default)
        ? asset!.ownership.owner
        : recipientAcc?.destination,
      true
    );
    const ataExists =
      !!(await this.ldProgram.provider.connection.getAccountInfo(ata));
    const neededBalance =
      0.00089088 * LAMPORTS_PER_SOL +
      (recipientAcc ? 0 : RECIPIENT_RENT) +
      (ataExists ? 0 : ATA_RENT);

    const instructions: TransactionInstruction[] = [];
    if (balance < neededBalance) {
      instructions.push(
        createMemoInstruction(
          "Couldn't claim rewards due to insufficient balance",
          [wallet]
        )
      );
      // @ts-ignore (we can remove this after a package publish)
    } else if (asset?.burnt) {
      instructions.push(
        createMemoInstruction(
          "Couldn't claim rewards due to burnt hotspot",
          [wallet]
        )
      );
    } else {
      let distributeIx;
      if (
        recipientAcc?.destination &&
        !recipientAcc?.destination.equals(PublicKey.default)
      ) {
        const destination = recipientAcc.destination;
        distributeIx = await this.ldProgram.methods
          .distributeCustomDestinationV0()
          .accountsPartial({
            common: {
              payer: wallet,
              recipient: recipient,
              lazyDistributor: this.lazyDistributor,
              rewardsMint: DNT,
              owner: destination,
              destinationAccount: getAssociatedTokenAddressSync(
                DNT,
                destination,
                true
              ),
            },
          })
          .instruction();
      } else if (asset?.compression.compressed) {
        distributeIx = await (
          await distributeCompressionRewards({
            program: this.ldProgram,
            assetId: new PublicKey(keyToAsset.asset!),
            lazyDistributor: this.lazyDistributor,
            rewardsMint: DNT,
            payer: wallet,
          })
        ).instruction();
      } else {
        distributeIx = await this.ldProgram.methods
          .distributeRewardsV0()
          .accountsPartial({
            common: {
              payer: wallet,
              recipient: recipient,
              lazyDistributor: this.lazyDistributor,
              rewardsMint: DNT,
              owner: asset!.ownership.owner,
              destinationAccount: getAssociatedTokenAddressSync(
                DNT,
                asset!.ownership.owner,
                true
              ),
            },
            recipientMintAccount: getAssociatedTokenAddressSync(
              new PublicKey(keyToAsset.asset!),
              asset!.ownership.owner,
              true
            ),
          })
          .instruction();
      }

      const entityKey = keyToAsset.encodedEntityKey!

      if (!recipientAcc) {
        if (asset?.compression.compressed) {
          instructions.push(
            await (
              await initializeCompressionRecipient({
                program: this.ldProgram,
                assetId: new PublicKey(keyToAsset.asset!),
                lazyDistributor: this.lazyDistributor,
                owner: wallet,
                // Temporarily set oracle as the payer to subsidize new HNT wallets.
                payer: wallet,
              })
            ).instruction()
          );
        } else {
          instructions.push(
            await this.ldProgram.methods
              .initializeRecipientV0()
              .accountsPartial({
                recipient: recipient,
                lazyDistributor: this.lazyDistributor,
                payer: wallet,
                mint: new PublicKey(keyToAsset.asset!),
              })
              .instruction()
          );
        }
      }

      instructions.push(
        await this.roProgram.methods
          .setCurrentRewardsWrapperV2({
            currentRewards: new BN(
              await this.db.getCurrentRewardsByEntity(entityKey)
            ),
            oracleIndex: process.env.ORACLE_INDEX
              ? parseInt(process.env.ORACLE_INDEX)
              : 0,
          })
          .accountsPartial({
            lazyDistributor: this.lazyDistributor,
            recipient,
            payer: wallet,
            keyToAsset: new PublicKey(keyToAsset.address!),
          })
          .instruction()
      );

      instructions.push(distributeIx);
    }

    const { transaction, remainingAccounts } = await compileTransaction(
      instructions,
      [
        [
          Buffer.from("claim_payer"),
          asset!.ownership.owner.toBuffer(),
          bumpBuffer,
        ],
      ]
    );
    const remoteTx = new RemoteTaskTransactionV0({
      task,
      taskQueuedAt,
      transaction: {
        ...transaction,
        accounts: remainingAccounts.map((acc) => acc.pubkey),
      },
    });
    const serialized = await RemoteTaskTransactionV0.serialize(
      this.tuktukProgram.coder.accounts,
      remoteTx
    );
    const resp = {
      transaction: serialized.toString("base64"),
      signature: Buffer.from(
        sign.detached(Uint8Array.from(serialized), this.oracle.secretKey)
      ).toString("base64"),
      remaining_accounts: remainingAccounts.map((acc) => ({
        pubkey: acc.pubkey.toBase58(),
        is_signer: acc.isSigner,
        is_writable: acc.isWritable,
      })),
    };
    reply.status(200).send(resp);

  }

  private async tuktukKtaHandler(
    request: FastifyRequest<{
      Params: { keyToAssetKey: string };
      Body: { task_queue: string; task: string; task_queued_at: number };
    }>,
    reply: FastifyReply
  ) {
    const taskQueue = new PublicKey(request.body.task_queue);
    const task = new PublicKey(request.body.task);
    const taskQueuedAt = new BN(request.body.task_queued_at);
    try {
      let keyToAsset = await KeyToAsset.findOne({
        where: {
          address: request.params.keyToAssetKey
        }
      });
      if (!keyToAsset) {
        reply.status(404).send({
          message: "Key to asset not found",
        });
        return;
      }
      const asset = await getAsset(
        process.env.ASSET_API_URL ||
        this.ldProgram.provider.connection.rpcEndpoint,
        new PublicKey(keyToAsset.asset!)
      );
      if (!asset) {
        reply.status(404).send({
          message: "Asset not found",
        });
        return;
      }
      return this.handleKta(reply, asset, keyToAsset, taskQueue, task, taskQueuedAt);
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: "Request failed",
      });
    }
  }

  private async tuktukWalletHandler(
    request: FastifyRequest<{
      Params: { wallet: string };
      Querystring: { batchNumber?: number };
      Body: { task_queue: string; task: string; task_queued_at: number };
    }>,
    reply: FastifyReply
  ) {
    const wallet = request.params.wallet;
    const batchNumber = request.query.batchNumber;
    const taskQueue = new PublicKey(request.body.task_queue);
    const task = new PublicKey(request.body.task);
    const taskQueuedAt = new BN(request.body.task_queued_at);
    try {
      const [customSignerWallet, bump] = customSignerKey(taskQueue, [
        Buffer.from("claim_payer"),
        new PublicKey(wallet).toBuffer(),
      ]);
      const bumpBuffer = Buffer.alloc(1);
      bumpBuffer.writeUint8(bump);

      const { entities, nextBatchNumber } = await this.db.getRewardableEntities(
        new PublicKey(wallet),
        MAX_CLAIMS_PER_TX,
        Number(batchNumber || 0)
      );

      const taskQueueAcc = await this.tuktukProgram.account.taskQueueV0.fetch(
        taskQueue
      );
      const balance =
        (
          await this.ldProgram.provider.connection.getAccountInfo(
            customSignerWallet
          )
        )?.lamports || 0;
      const fees =
        taskQueueAcc.minCrankReward.toNumber() * (entities.length + 1);
      const neededBalance = 0.00089088 * LAMPORTS_PER_SOL + fees;
      const instructions: TransactionInstruction[] = [];
      if (balance < neededBalance) {
        instructions.push(
          createMemoInstruction(
            "Finished claiming rewards due to insufficient balance",
            [customSignerWallet]
          )
        );
      } else {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: customSignerWallet,
            toPubkey: task,
            lamports: fees,
          })
        );
        for (const entity of entities) {
          instructions.push(
            // @ts-ignore (we can remove this after a package publish)
            await this.hplCronsProgram.methods
              .requeueEntityClaimV1()
              .accounts({
                keyToAsset: entity.keyToAsset,
                wallet: new PublicKey(wallet),
              })
              .instruction()
          );
        }

        if (entities.length > 0) {
          instructions.push(
            await this.hplCronsProgram.methods
              .requeueWalletClaimV0({
                batchNumber: nextBatchNumber,
              })
              .accounts({
                wallet: new PublicKey(wallet),
              })
              .instruction()
          );
        } else {
          instructions.push(
            createMemoInstruction("Finished claiming rewards", [
              customSignerWallet,
            ])
          );
        }
      }

      const { transaction, remainingAccounts } = await compileTransaction(
        instructions,
        [
          [
            Buffer.from("claim_payer"),
            new PublicKey(wallet).toBuffer(),
            bumpBuffer,
          ],
        ]
      );
      const remoteTx = new RemoteTaskTransactionV0({
        task,
        taskQueuedAt,
        transaction: {
          ...transaction,
          accounts: remainingAccounts.map((acc) => acc.pubkey),
        },
      });
      const serialized = await RemoteTaskTransactionV0.serialize(
        this.tuktukProgram.coder.accounts,
        remoteTx
      );
      const resp = {
        transaction: serialized.toString("base64"),
        signature: Buffer.from(
          sign.detached(Uint8Array.from(serialized), this.oracle.secretKey)
        ).toString("base64"),
        remaining_accounts: remainingAccounts.map((acc) => ({
          pubkey: acc.pubkey.toBase58(),
          is_signer: acc.isSigner,
          is_writable: acc.isWritable,
        })),
      };
      reply.status(200).send(resp);
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: "Request failed",
      });
    }
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
      return;
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
    const tuktukProgram = await initTuktuk(provider);
    const ldProgram = await initLazy(provider);
    const roProgram = await initRewards(provider);
    const hemProgram = await initHeliumEntityManager(provider);
    const hplCronsProgram = await initHplCrons(provider);

    Reward.sync();

    const LAZY_DISTRIBUTOR = lazyDistributorKey(DNT)[0];
    const server = new OracleServer(
      tuktukProgram,
      ldProgram,
      roProgram,
      hemProgram,
      hplCronsProgram,
      oracleKeypair,
      new PgDatabase(hemProgram, ldProgram, LAZY_DISTRIBUTOR),
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
