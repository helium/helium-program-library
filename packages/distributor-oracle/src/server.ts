import express from 'express';
import { PublicKey, Transaction } from '@solana/web3.js'
import bodyParser from 'body-parser'
import { PROGRAM_ID } from '../../lazy-distributor-sdk/src';
const app = express();
const port = 8080;

app.use(bodyParser.json());

app.get("/", (req: express.Request, res: express.Response) => {
  console.log(req.query);
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

  res.json({
    currentRewards: 5,
  });
});

app.post("/", (req, res) => {
  console.log(req.body);
  if (!req.body.transaction) {
    res.status(400).json({error: "No transaction field"});
    return;
  }

  const tx = Transaction.from(req.body.transaction.data);
  console.log(tx);

  // validate only interacts with LD program
  for (const ix of tx.instructions) {
    if (!ix.programId.equals(PROGRAM_ID)) {
      res.status(400).json({error: "Invalid transaction"});
      return;
    }
  }

  // validate setRewards value for this oracle is correct


  // validate that this oracle is not the fee payer


  res.json({success: true})
})


app.listen( port, () => {
  console.log( `server started at http://localhost:${port}` );
});

export default app;