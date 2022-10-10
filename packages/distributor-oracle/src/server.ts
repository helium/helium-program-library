import express, {Application, Request, Response} from 'express';
import { PublicKey, Transaction, Keypair } from '@solana/web3.js'
import bodyParser from 'body-parser'
import { init, PROGRAM_ID } from '../../lazy-distributor-sdk/src';
import { AnchorProvider, BorshInstructionCoder, Program, setProvider, getProvider } from '@project-serum/anchor';
import { LazyDistributor } from '../../../target/types/lazy_distributor';
import fs from 'fs';

export interface Database {
  getCurrentRewards: () => Promise<number>
}

export class DatabaseMock implements Database {
  async getCurrentRewards() {
    return 150000;
  }
}


export class OracleServer {
  app: Application;
  port = 8080;
  private server: any;

  constructor(
    public program: Program<LazyDistributor>, 
    private oracle: Keypair,
    public db: Database,
  ) {
    this.initApp();
    this.addRoutes();
  }

  private initApp() {
    const app = express();
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
    this.server.close()
  }

  private addRoutes() {
    this.app.get("/", this.getCurrentRewardsHandler.bind(this));
    this.app.post("/", this.signTransactionHandler.bind(this));
  }

  private async getCurrentRewardsHandler(req: Request, res: Response) {
    const mintStr = req.query.mint;
    if (!mintStr) {
      res.status(400).json({error: "No mint key provided"});
      return;
    }
    let mint: PublicKey;
    try {
      mint = new PublicKey(mintStr);
    } catch(err) {
      res.status(400).json({error: "Invalid mint key"});
      return;
    }

    const currentRewards = await this.db.getCurrentRewards();
  
    res.json({
      currentRewards,
    });
  }

  private async signTransactionHandler(req: Request, res: Response) {
    if (!req.body.transaction) {
      res.status(400).json({error: "No transaction field"});
      return;
    }
  
    const tx = Transaction.from(req.body.transaction.data);
  
    // validate only interacts with LD program and only calls setCurrentRewards and distributeRewards
    for (const ix of tx.instructions) {
      if (!ix.programId.equals(PROGRAM_ID)) {
        res.status(400).json({error: "Invalid transaction"});
        return;
      }
      let decoded = (this.program.coder.instruction as BorshInstructionCoder).decode(ix.data);
      if (!decoded || (decoded.name !== "setCurrentRewardsV0" && decoded.name !== "distributeRewardsV0")) {
        res.status(400).json({error: "Invalid transaction"});
      }
    }

    // validate setRewards value for this oracle is correct
    for (const ix of tx.instructions) {
      const oracleKeyIdx = this.program.idl.instructions.find(
        (x) => x.name === "setCurrentRewardsV0")!.accounts.findIndex(
          (x) => x.name === "oracle")!;
      
      if (ix.keys[oracleKeyIdx].pubkey.equals(this.oracle.publicKey)) {
        let decoded = (this.program.coder.instruction as BorshInstructionCoder).decode(ix.data);

        const currentRewards = await this.db.getCurrentRewards();
        // @ts-ignore
        if (currentRewards != decoded.data.args.currentRewards.toNumber()) {
          res.status(400).json({error: "Invalid amount"});
          return;
        }
      }
    }

    // validate that this oracle is not the fee payer
    if (tx.feePayer?.equals(this.oracle.publicKey)) {
      res.status(400).json({error: "Nice try"});
      return;
    }

    tx.partialSign(this.oracle);
    
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false});
    res.json({success: true, transaction: serialized})
  }
}

(async function() {
  if (process.argv.length > 2 && process.argv[2] == "serve") {
    // driver code for running server
    setProvider(AnchorProvider.env());
    const provider = getProvider() as AnchorProvider;
    const oracleKeypair = Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(fs.readFileSync((process.env.ORACLE_KEYPAIR_PATH || process.env.ANCHOR_WALLET)!).toString())
      )
    );
    const program = await init(provider);
    const server = new OracleServer(program, oracleKeypair, new DatabaseMock);
    server.start();
  }
})()