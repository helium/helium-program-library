import Address from "@helium/address";
import { Keypair } from "@helium/crypto";
import { sendAndConfirmWithRetry } from "@helium/spl-utils";
import { AddGatewayV1 } from "@helium/transactions";
import { accountProviders } from "@metaplex-foundation/mpl-bubblegum";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair as SolanaKeypair,
} from "@solana/web3.js";
import axios from "axios";
import { BN } from "bn.js";

function random(len: number): string {
  return new Array(len).join().replace(/(.|$)/g, function () {
    return ((Math.random() * 36) | 0).toString(36);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SPL_NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

describe("onboarding server", () => {
  let me: Keypair;
  let gateway: Keypair;

  const maker = Address.fromB58(
    "14neTgRNZui1hSiHgE3LXjSfwkPU8BEB192MLXXDFnSY2xKjH51"
  );
  let onboardingKey: string;

  // let base = "http://localhost:3002";
  let base = "https://onboarding.web.test-helium.com";
  before(async () => {
    me = await Keypair.makeRandom();
    gateway = await Keypair.makeRandom();
    onboardingKey = gateway.address.b58;
    const result = await axios.post(
      `${base}/api/v2/hotspots`,
      {
        onboardingKey,
        macWlan0: random(10),
        macEth0: random(10),
        rpiSerial: random(10),
        heliumSerial: random(10),
        batch: "example-batch",
      },
      {
        headers: {
          authorization:
            "pk_TgclExRP7rEXAEQlSgrrDwaZUHJAPcw/nNfkEpWOPCk=:sk_E1xc9OVq1/5oKLGD4RzxST7bl+LMnJhalkQ3vZp/QbOjNltvAmHyPolzA0Pb2HyTD68mZp4lETuC19Y+vI72nA==pk_TgclExRP7rEXAEQlSgrrDwaZUHJAPcw/nNfkEpWOPCk=:sk_E1xc9OVq1/5oKLGD4RzxST7bl+LMnJhalkQ3vZp/QbOjNltvAmHyPolzA0Pb2HyTD68mZp4lETuC19Y+vI72nA=="
        },
      }
    );
    console.log(result)

    await sleep(2000);
  });

  it("should run issue txs", async () => {
    const hotspot = (
      await axios.get(`${base}/api/v2/hotspots/${onboardingKey}`)
    ).data.data;
    console.log(hotspot);
    console.log(me.privateKey);
    const solanaKeypair = SolanaKeypair.fromSecretKey(me.privateKey);
    console.log("Solana pubkey: ", solanaKeypair.publicKey.toBase58())

    await sleep(2000);

    const result = await axios.post(
      `${base}/api/v3/transactions/create-hotspot`,
      {
        location: new BN(1).toString(),
        transaction: (
          await new AddGatewayV1({
            owner: me.address,
            gateway: gateway.address,
            payer: maker,
          }).sign({
            gateway,
          })
        ).toString(),
      }
    );

    const connection = new Connection("https://api.devnet.solana.com");
    // const connection = new Connection("http://127.0.0.1:8899");
    const { solanaTransactions } = result.data.data;
    for (const solanaTransaction of solanaTransactions) {
      const txid = await sendAndConfirmWithRetry(
        connection,
        Buffer.from(solanaTransaction),
        { skipPreflight: true },
        "confirmed"
      );
      console.log(txid.txid);
    }

    let tries = 0;
    let onboardResult: any;
    while (tries < 10 && !onboardResult) {
      try {
        onboardResult = await axios.post(
              `${base}/api/v3/transactions/mobile/onboard`,
              {
                entityKey: onboardingKey,
              }
            );
      } catch {
        console.log(`Hotspot may not exist yet ${tries}`);
        tries++;
        await sleep(2000); // Wait for hotspot to be indexed into asset api
      }
    }
    

    for (const solanaTransaction of onboardResult!.data.data
      .solanaTransactions) {
      const tx = Transaction.from(Buffer.from(solanaTransaction));
      tx.partialSign(solanaKeypair)
      const txid = await sendAndConfirmWithRetry(
        connection,
        tx.serialize(),
        { skipPreflight: true },
        "confirmed"
      );
      console.log(txid.txid);
    }

    const updateResult = await axios.post(
      `${base}/api/v3/transactions/mobile/update-metadata`,
      {
        entityKey: onboardingKey,
        location: new BN(1).toString(),
        elevation: 2,
        gain: 11,
        wallet: solanaKeypair.publicKey.toBase58()
      }
    );

    for (const solanaTransaction of updateResult.data.data.solanaTransactions) {
      const tx = Transaction.from(Buffer.from(solanaTransaction));
      tx.partialSign(solanaKeypair)
      const txid = await sendAndConfirmWithRetry(
        connection,
        tx.serialize(),
        { skipPreflight: true },
        "confirmed"
      );
      console.log(txid.txid);
    }

    // Test sending two updates, so one is payer
    // console.log(solanaKeypair.publicKey.toBase58())
    // await connection.requestAirdrop(solanaKeypair.publicKey, 100000000);
    // const updateResult2 = await axios.post(
    //   `${base}/api/v3/transactions/mobile/update-metadata`,
    //   {
    //     entityKey: onboardingKey,
    //     location: new BN(2).toString(),
    //     elevation: 2,
    //     gain: 11,
    //     wallet: solanaKeypair.publicKey.toBase58(),
    //   }
    // );

    // for (const solanaTransaction of updateResult2.data.data
    //   .solanaTransactions) {
    //   const tx = Transaction.from(Buffer.from(solanaTransaction));
    //   tx.partialSign(solanaKeypair);
    //   const txid = await sendAndConfirmWithRetry(
    //     connection,
    //     tx.serialize(),
    //     { skipPreflight: true },
    //     "confirmed"
    //   );
    //   console.log(txid.txid);
    // }
  });
});