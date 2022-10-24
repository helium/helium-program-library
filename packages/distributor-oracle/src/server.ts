import dotenv from "dotenv";
dotenv.config();
import express, { Application, Request, Response } from "express";
import cors from "cors";
import {
  PublicKey,
  Transaction,
  Keypair,
  TransactionInstruction,
} from "@solana/web3.js";
import bodyParser from "body-parser";
import { init, PROGRAM_ID } from "../../lazy-distributor-sdk/src";
import {
  AnchorProvider,
  BorshInstructionCoder,
  Program,
  setProvider,
  getProvider,
} from "@project-serum/anchor";
import { LazyDistributor } from "../../../target/types/lazy_distributor";
import fs from "fs";

export interface Database {
  getCurrentRewards: (mintKey: PublicKey) => Promise<number>;
  getCurrentHotspotRewards: (hotspotKey: PublicKey) => Promise<number>;
  incrementHotspotRewards: (hotspotKey: PublicKey) => Promise<void>;
  endEpoch: () => Promise<{
    [key: string]: number;
  }>;
}

export class DatabaseMock implements Database {
  inMemHash: {
    totalClicks: number;
    lifetimeRewards: number;
    byHotspot: {
      [key: string]: {
        totalClicks: number;
        lifetimeRewards: number;
      };
    };
  };

  constructor() {
    this.inMemHash = {
      totalClicks: 489,
      lifetimeRewards: 0,
      byHotspot: {
        "5me9zwTMg5VSd1o2hSfZ4gdwYy1zCKmUEWqJnPoyPqud": {
          totalClicks: 126,
          lifetimeRewards: 0,
        },
        "6a81VrpAHMrbsn5Z7G4auSiDaeTgNAHkxXkEAKTqHm2T": {
          totalClicks: 57,
          lifetimeRewards: 0,
        },
        H4ujggiBqQ2j3b3k3UEtrqZwx4ihVWLT7Sc6oWtU6srf: {
          totalClicks: 73,
          lifetimeRewards: 0,
        },
        JBpMp7hrjkjvAwprW8jsA9efKdxvaTTSh3YG2xpLGxUW: {
          totalClicks: 233,
          lifetimeRewards: 0,
        },
      },
    };
  }

  async getCurrentRewards(mintKey: PublicKey) {
    return 150000;
  }

  async getCurrentHotspotRewards(hotspotKey: PublicKey) {
    return (
      this.inMemHash.byHotspot[hotspotKey.toBase58()]?.totalClicks -
        this.inMemHash.byHotspot[hotspotKey.toBase58()]?.lifetimeRewards || 0
    );
  }

  async incrementHotspotRewards(hotspotKey: PublicKey) {
    this.inMemHash = {
      ...this.inMemHash,
      totalClicks: this.inMemHash.totalClicks + 1,
      byHotspot: {
        ...this.inMemHash.byHotspot,
        [hotspotKey.toBase58()]: {
          totalClicks:
            (this.inMemHash.byHotspot[hotspotKey.toBase58()]?.totalClicks ||
              0) + 1,
          lifetimeRewards:
            this.inMemHash.byHotspot[hotspotKey.toBase58()]?.lifetimeRewards ||
            0,
        },
      },
    };
  }

  async endEpoch() {
    const rewardablePercentageByHotspot: { [key: string]: number } = {};
    const { totalClicks, lifetimeRewards, byHotspot } = this.inMemHash;
    const clickRewardsDiff = totalClicks - lifetimeRewards;
    const maxEpochRewards = +(process.env.EPOCH_MAX_REWARDS || 0);

    if (maxEpochRewards > 0) {
      for (const [key, value] of Object.entries(byHotspot)) {
        const diff = value.totalClicks - value.lifetimeRewards;
        let awardedAmount =
          diff <= 0 ? 0 : (diff / clickRewardsDiff) * maxEpochRewards;

        rewardablePercentageByHotspot[key] = awardedAmount;

        this.inMemHash = {
          ...this.inMemHash,
          lifetimeRewards: this.inMemHash.lifetimeRewards + awardedAmount,
          byHotspot: {
            ...this.inMemHash.byHotspot,
            [key]: {
              ...this.inMemHash.byHotspot[key],
              lifetimeRewards:
                this.inMemHash.byHotspot[key].lifetimeRewards + awardedAmount,
            },
          },
        };
      }
    }

    return rewardablePercentageByHotspot;
  }
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
    this.server = this.app.listen(this.port, () => {
      console.log(`server started at http://localhost:${this.port}`);
    });
  }

  public close() {
    this.server.close();
  }

  private addRoutes() {
    this.app.get("/", this.getCurrentRewardsHandler.bind(this));
    this.app.post("/", this.signTransactionHandler.bind(this));
    this.app.post("/hotspots", this.incrementHotspotRewardsHandler.bind(this));
    this.app.get(
      "/hotspots/:hotspotKey",
      this.getHotspotRewardsHandler.bind(this)
    );
    this.app.post("/endepoch", this.endEpochHandler.bind(this));
  }

  private async endEpochHandler(reg: Request, res: Response) {
    const percentageOfRewardsByHotspot = await this.db.endEpoch();

    res.json({
      success: true,
      distributionByHotspot: percentageOfRewardsByHotspot,
    });
  }

  private async incrementHotspotRewardsHandler(req: Request, res: Response) {
    const hotspotStr = req.body.hotspotKey;
    if (!hotspotStr) {
      res.status(400).json({ error: "No hotspot key provided" });
      return;
    }
    let hotspot: PublicKey;
    try {
      hotspot = new PublicKey(hotspotStr);
    } catch (err) {
      res.status(400).json({ error: "Invalid hotspot key" });
      return;
    }

    await this.db.incrementHotspotRewards(hotspot);

    res.json({ success: true });
  }

  private async getHotspotRewardsHandler(req: Request, res: Response) {
    const hotspotStr = req.params.hotspotKey;
    if (!hotspotStr) {
      res.status(400).json({ error: "No hotspot key provided" });
      return;
    }
    let hotspot: PublicKey;
    try {
      hotspot = new PublicKey(hotspotStr);
    } catch (err) {
      res.status(400).json({ error: "Invalid hotspot key" });
      return;
    }

    const currentRewards = await this.db.getCurrentHotspotRewards(hotspot);

    res.json({
      currentRewards,
    });
  }

  private async getCurrentRewardsHandler(req: Request, res: Response) {
    const mintStr = req.query.mint;
    if (!mintStr) {
      res.status(400).json({ error: "No mint key provided" });
      return;
    }
    let mint: PublicKey;
    try {
      mint = new PublicKey(mintStr);
    } catch (err) {
      res.status(400).json({ error: "Invalid mint key" });
      return;
    }

    const currentRewards = await this.db.getCurrentRewards(mint);

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
          decoded.name !== "distributeRewardsV0")
      ) {
        res.status(400).json({ error: "Invalid instructions in transaction" });
        return;
      }
      if (decoded.name === "setCurrentRewardsV0") setRewardIxs.push(ix);
    }

    const setRewardsIx = this.program.idl.instructions.find(
      (x) => x.name === "setCurrentRewardsV0"
    )!;
    const oracleKeyIdx = setRewardsIx.accounts.findIndex(
      (x) => x.name === "oracle"
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
        const recipientAcc = await this.program.account.recipientV0.fetch(
          ix.keys[recipientIdx].pubkey
        );

        const currentRewards = await this.db.getCurrentRewards(
          recipientAcc.mint
        );
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
    const server = new OracleServer(program, oracleKeypair, new DatabaseMock());
    server.start();
  }
})();
