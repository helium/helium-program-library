import express, {Application, Request, Response} from 'express';
import { PublicKey, Transaction, Keypair } from '@solana/web3.js'
import bodyParser from 'body-parser'
import { init, PROGRAM_ID } from '../../lazy-distributor-sdk/src';
import { AnchorProvider, BorshInstructionCoder, Program } from '@project-serum/anchor';
import { LazyDistributor } from '../../../target/types/lazy_distributor';

 export class OracleServer {
  app: Application;

  constructor(
    public program: Program<LazyDistributor>, 
    private oracle: Keypair
  ) {
    this.initApp();
    this.addRoutes();
  }

  static async init(provider: AnchorProvider, oracle: Keypair) {
    const program = await init(provider);
    return new OracleServer(program, oracle);
  }

  private initApp() {
    const app = express();
    const port = 8080;
    
    app.use(bodyParser.json());
  
    app.listen( port, () => {
      console.log(`server started at http://localhost:${port}`);
    });
    this.app = app;
    this.addRoutes();

  }

  private addRoutes() {
    this.app.get("/", this.getCurrentRewardsHandler.bind(this));
    this.app.post("/", this.signTransactionHandler.bind(this));
  }

  private async getCurrentRewards() {
    return 5;
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

    const currentRewards = await this.getCurrentRewards();
  
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

        const currentRewards = await this.getCurrentRewards();
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