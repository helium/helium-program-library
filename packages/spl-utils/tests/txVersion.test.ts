import { Keypair } from "@solana/web3.js";
import { expect } from "chai";
import {
  resetTxVersionCache,
  resolveSignerVersions,
  resolveTxVersion,
  setWalletSignedTxVersionCeiling,
} from "../src/txVersion";

const TX_V1_GATE = "txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL";

// Feature account data is bincode Option<u64>: tag, then activation slot LE.
const featureData = (activationSlot: number | null): Buffer => {
  if (activationSlot === null) return Buffer.from([0]);
  const data = Buffer.alloc(9);
  data[0] = 1;
  data.writeBigUInt64LE(BigInt(activationSlot), 1);
  return data;
};

// Stands in for the RPC node: its reported solana-core and the gate account.
const fakeConnection = ({
  endpoint = "http://node",
  solanaCore = "4.2.0",
  gate = featureData(100) as Buffer | null,
  slot = 200,
  fail = false,
} = {}) => {
  const calls = { getVersion: 0 };
  const connection: any = {
    rpcEndpoint: endpoint,
    getVersion: async () => {
      calls.getVersion++;
      if (fail) throw new Error("fetch failed");
      return { "solana-core": solanaCore };
    },
    getAccountInfo: async (key: any) => {
      expect(key.toBase58()).to.equal(TX_V1_GATE);
      return gate && { data: gate };
    },
    getSlot: async () => slot,
  };
  return { connection, calls };
};

describe("resolveSignerVersions", () => {
  beforeEach(() => resetTxVersionCache());

  it("gives a keypair-backed wallet legacy, v0 and v1", () => {
    const payer = Keypair.generate();
    const wallet = { payer, publicKey: payer.publicKey };
    expect([...resolveSignerVersions(wallet)]).to.have.members([
      "legacy",
      0,
      1,
    ]);
  });

  it("reads a wallet adapter's supportedTransactionVersions", () => {
    const wallet = {
      publicKey: Keypair.generate().publicKey,
      supportedTransactionVersions: new Set(["legacy", 0]),
    };
    expect([...resolveSignerVersions(wallet)]).to.have.members(["legacy", 0]);
  });

  it("treats a null adapter set as legacy only", () => {
    const wallet = {
      publicKey: Keypair.generate().publicKey,
      supportedTransactionVersions: null,
    };
    expect([...resolveSignerVersions(wallet)]).to.have.members(["legacy"]);
  });

  it("gives an unknown-shaped signer legacy and v0", () => {
    const wallet = {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
    };
    expect([...resolveSignerVersions(wallet)]).to.have.members(["legacy", 0]);
  });

  it("logs a signer's capability once per signer", () => {
    const lines: string[] = [];
    const info = console.info;
    console.info = (...args: any[]) => lines.push(args.join(" "));
    try {
      const a = Keypair.generate();
      const b = Keypair.generate();
      resolveSignerVersions({ payer: a, publicKey: a.publicKey });
      resolveSignerVersions({ payer: a, publicKey: a.publicKey });
      resolveSignerVersions({ publicKey: b.publicKey });
    } finally {
      console.info = info;
    }
    expect(lines).to.have.length(2);
  });
});


describe("resolveTxVersion", () => {
  beforeEach(() => resetTxVersionCache());

  it("resolves 1 on a 4.2 node with the gate activated", async () => {
    const { connection } = fakeConnection();
    expect(await resolveTxVersion(connection)).to.equal(1);
  });

  it("resolves 0 on a node older than 4.2", async () => {
    const { connection } = fakeConnection({ solanaCore: "4.1.5" });
    expect(await resolveTxVersion(connection)).to.equal(0);
  });

  it("resolves 0 when the gate account is absent", async () => {
    const { connection } = fakeConnection({ gate: null });
    expect(await resolveTxVersion(connection)).to.equal(0);
  });

  it("resolves 0 when the gate is not activated", async () => {
    const { connection } = fakeConnection({ gate: featureData(null) });
    expect(await resolveTxVersion(connection)).to.equal(0);
  });

  it("resolves 0 when the gate activates after the current slot", async () => {
    const { connection } = fakeConnection({ gate: featureData(300) });
    expect(await resolveTxVersion(connection)).to.equal(0);
  });

  it("detects once per endpoint", async () => {
    const { connection, calls } = fakeConnection();
    await resolveTxVersion(connection);
    await resolveTxVersion(connection);
    expect(calls.getVersion).to.equal(1);

    const other = fakeConnection({ endpoint: "http://other" });
    await resolveTxVersion(other.connection);
    expect(other.calls.getVersion).to.equal(1);
  });

  it("resolves 0 when detection fails and warns once per endpoint", async () => {
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: any[]) => warnings.push(args.join(" "));
    try {
      const { connection } = fakeConnection({ fail: true });
      expect(await resolveTxVersion(connection)).to.equal(0);
      expect(await resolveTxVersion(connection)).to.equal(0);
      const other = fakeConnection({ endpoint: "http://other", fail: true });
      expect(await resolveTxVersion(other.connection)).to.equal(0);
    } finally {
      console.warn = warn;
    }
    expect(warnings).to.have.length(2);
  });
});

describe("transaction version precedence", () => {
  const keypairWallet = () => {
    const payer = Keypair.generate();
    return { payer, publicKey: payer.publicKey };
  };
  const adapterWallet = (versions: any[]) => ({
    publicKey: Keypair.generate().publicKey,
    supportedTransactionVersions: new Set(versions),
  });

  beforeEach(() => resetTxVersionCache());
  afterEach(() => {
    delete process.env.HPL_TX_VERSION;
    setWalletSignedTxVersionCeiling(0);
    resetTxVersionCache();
  });

  it("per-call version wins over detection", async () => {
    const v1Node = fakeConnection().connection;
    const v0Node = fakeConnection({ endpoint: "http://old", solanaCore: "4.1.5" })
      .connection;
    expect(await resolveTxVersion(v1Node, { version: 0 })).to.equal(0);
    expect(await resolveTxVersion(v0Node, { version: 1 })).to.equal(1);
    expect(await resolveTxVersion(v1Node, { version: "auto" })).to.equal(1);
  });

  it("HPL_TX_VERSION wins over detection", async () => {
    process.env.HPL_TX_VERSION = "v1";
    const v0Node = fakeConnection({ solanaCore: "4.1.5" }).connection;
    expect(await resolveTxVersion(v0Node)).to.equal(1);

    resetTxVersionCache();
    process.env.HPL_TX_VERSION = "v0";
    const v1Node = fakeConnection().connection;
    expect(await resolveTxVersion(v1Node)).to.equal(0);
  });

  it("HPL_TX_VERSION wins over signer capability", async () => {
    process.env.HPL_TX_VERSION = "v1";
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, { wallet: adapterWallet(["legacy", 0]) })
    ).to.equal(1);
  });

  it("per-call version wins over HPL_TX_VERSION", async () => {
    process.env.HPL_TX_VERSION = "v1";
    const { connection } = fakeConnection();
    expect(await resolveTxVersion(connection, { version: 0 })).to.equal(0);
  });

  it("reads HPL_TX_VERSION once", async () => {
    process.env.HPL_TX_VERSION = "v0";
    const { connection } = fakeConnection();
    expect(await resolveTxVersion(connection)).to.equal(0);
    process.env.HPL_TX_VERSION = "v1";
    expect(await resolveTxVersion(connection)).to.equal(0);
  });

  it("rejects an HPL_TX_VERSION other than v0, v1 or auto", async () => {
    const { connection } = fakeConnection();
    for (const value of ["V0", "0", "v2"]) {
      resetTxVersionCache();
      process.env.HPL_TX_VERSION = value;
      let error: Error | undefined;
      try {
        await resolveTxVersion(connection);
      } catch (e: any) {
        error = e;
      }
      expect(error?.message).to.equal(
        `HPL_TX_VERSION must be v0, v1 or auto; got ${value}`
      );
    }
  });

  it("HPL_TX_VERSION=auto defers to detection", async () => {
    process.env.HPL_TX_VERSION = "auto";
    const { connection } = fakeConnection();
    expect(await resolveTxVersion(connection)).to.equal(1);
  });

  it("builds v1 for a keypair signer on a v1 node", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, { wallet: keypairWallet() })
    ).to.equal(1);
  });

  it("builds v0 for a signer without v1 on a v1 node", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, { wallet: adapterWallet(["legacy", 0]) })
    ).to.equal(0);
    expect(
      await resolveTxVersion(connection, {
        wallet: { publicKey: Keypair.generate().publicKey },
      })
    ).to.equal(0);
  });

  it("builds v0 for a keypair signer on a node without v1", async () => {
    const { connection } = fakeConnection({ solanaCore: "4.1.5" });
    expect(
      await resolveTxVersion(connection, { wallet: keypairWallet() })
    ).to.equal(0);
  });

  it("caps a v1-capable wallet adapter at the default ceiling of 0", async () => {
    const { connection } = fakeConnection();
    const wallet = adapterWallet(["legacy", 0, 1]);
    expect(await resolveTxVersion(connection, { wallet })).to.equal(0);

    setWalletSignedTxVersionCeiling(1);
    expect(await resolveTxVersion(connection, { wallet })).to.equal(1);
  });
});
