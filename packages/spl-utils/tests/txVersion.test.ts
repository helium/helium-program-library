import { Keypair } from "@solana/web3.js";
import { expect } from "chai";
import {
  resetTxVersionCache,
  resolveSignerVersions,
  resolveTxVersion,
  signingFromWallet,
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

  it("logs a signer's capability once per capability set", () => {
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

  it("logs two signers with the same capability set once between them", () => {
    const lines: string[] = [];
    const info = console.info;
    console.info = (...args: any[]) => lines.push(args.join(" "));
    try {
      const a = Keypair.generate();
      const b = Keypair.generate();
      resolveSignerVersions({ payer: a, publicKey: a.publicKey });
      resolveSignerVersions({ payer: b, publicKey: b.publicKey });
    } finally {
      console.info = info;
    }
    expect(lines).to.have.length(1);
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

  it("signer capability caps HPL_TX_VERSION=v1", async () => {
    process.env.HPL_TX_VERSION = "v1";
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, {
        wallet: adapterWallet(["legacy", 0]),
      })
    ).to.equal(0);
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

  it("rejects an invalid HPL_TX_VERSION on a pinned call", async () => {
    process.env.HPL_TX_VERSION = "v1x";
    const { connection } = fakeConnection();
    let error: Error | undefined;
    try {
      await resolveTxVersion(connection, { version: 0 });
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).to.equal(
      "HPL_TX_VERSION must be v0, v1 or auto; got v1x"
    );
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

  it("builds v0 for a v1-capable wallet adapter without a payer", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, {
        wallet: adapterWallet(["legacy", 0, 1]),
      })
    ).to.equal(0);
  });

  it("builds v0 for a keypair signer on a node without v1", async () => {
    const { connection } = fakeConnection({ solanaCore: "4.1.5" });
    expect(
      await resolveTxVersion(connection, { wallet: keypairWallet() })
    ).to.equal(0);
  });

  it("resolves 0 for a v0-only wallet without calling the node", async () => {
    const calls: string[] = [];
    const connection: any = {
      rpcEndpoint: "http://node",
      getVersion: async () => calls.push("getVersion"),
      getAccountInfo: async () => calls.push("getAccountInfo"),
      getSlot: async () => calls.push("getSlot"),
    };
    expect(
      await resolveTxVersion(connection, {
        wallet: adapterWallet(["legacy", 0]),
      })
    ).to.equal(0);
    expect(calls).to.be.empty;
  });
});

describe("transaction version from signing", () => {
  const keypairWallet = () => {
    const payer = Keypair.generate();
    return { payer, publicKey: payer.publicKey };
  };
  const adapterWallet = (versions: any[]) => ({
    publicKey: Keypair.generate().publicKey,
    supportedTransactionVersions: new Set(versions),
  });
  // A node that fails the test when asked anything.
  const silentNode = () =>
    ({
      rpcEndpoint: "http://silent",
      getVersion: async () => expect.fail("called getVersion"),
      getAccountInfo: async () => expect.fail("called getAccountInfo"),
      getSlot: async () => expect.fail("called getSlot"),
    }) as any;

  beforeEach(() => resetTxVersionCache());
  afterEach(() => {
    delete process.env.HPL_TX_VERSION;
    resetTxVersionCache();
  });

  it("builds v1 for a keypair fee payer on a v1 node", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, { signing: { feePayer: "keypair" } })
    ).to.equal(1);
  });

  it("builds v0 for a keypair fee payer on a node without v1", async () => {
    const { connection } = fakeConnection({ solanaCore: "4.1.5" });
    expect(
      await resolveTxVersion(connection, { signing: { feePayer: "keypair" } })
    ).to.equal(0);
  });

  it("infers a wallet fee payer from a wallet with a payer that does not sign v1", async () => {
    const payer = Keypair.generate();
    const wallet = {
      payer,
      publicKey: payer.publicKey,
      supportedTransactionVersions: new Set(["legacy", 0]),
    };
    expect(signingFromWallet(wallet)).to.deep.equal({ feePayer: "wallet" });
    const { connection } = fakeConnection();
    expect(await resolveTxVersion(connection, { wallet })).to.equal(0);
  });

  it("builds v0 for a wallet fee payer without calling the node", async () => {
    expect(
      await resolveTxVersion(silentNode(), { signing: { feePayer: "wallet" } })
    ).to.equal(0);
  });

  it("builds v0 for a wallet fee payer with a v0-only co-signer", async () => {
    expect(
      await resolveTxVersion(silentNode(), {
        signing: {
          feePayer: "wallet",
          coSigners: [{ versions: ["legacy", 0] }],
        },
      })
    ).to.equal(0);
  });

  it("builds v0 for a keypair fee payer with a v0-only co-signer", async () => {
    expect(
      await resolveTxVersion(silentNode(), {
        signing: {
          feePayer: "keypair",
          coSigners: [{ versions: ["legacy", 0, 1] }, { versions: [0] }],
        },
      })
    ).to.equal(0);
  });

  it("builds v0 for a keypair fee payer with a wallet co-signer without calling the node", async () => {
    expect(
      await resolveTxVersion(silentNode(), {
        signing: { feePayer: "keypair", coSigners: ["wallet"] },
      })
    ).to.equal(0);
  });

  it("builds v1 for a keypair fee payer whose co-signers all sign v1", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, {
        signing: {
          feePayer: "keypair",
          coSigners: ["keypair", { versions: [0, 1] }, { versions: ["legacy", 1] }],
        },
      })
    ).to.equal(1);
  });

  it("builds v1 for a fee payer described by versions that include v1", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, {
        signing: { feePayer: { versions: [0, 1] } },
      })
    ).to.equal(1);
  });

  it("builds v0 for a fee payer described by versions without v1", async () => {
    expect(
      await resolveTxVersion(silentNode(), {
        signing: { feePayer: { versions: ["legacy", 0] } },
      })
    ).to.equal(0);
  });

  it("follows signing over the provider wallet", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, {
        wallet: keypairWallet(),
        signing: { feePayer: "wallet" },
      })
    ).to.equal(0);
  });

  it("infers a keypair fee payer from a wallet with a payer", async () => {
    const { connection } = fakeConnection();
    expect(
      await resolveTxVersion(connection, { wallet: keypairWallet() })
    ).to.equal(1);
  });

  it("infers a wallet fee payer from an adapter, even one that signs v1", async () => {
    expect(
      await resolveTxVersion(silentNode(), {
        wallet: adapterWallet(["legacy", 0, 1]),
      })
    ).to.equal(0);
  });

  it("follows the node alone with no signing and no wallet", async () => {
    const { connection } = fakeConnection();
    expect(await resolveTxVersion(connection)).to.equal(1);
  });

  it("lets the per-call version win over signing", async () => {
    expect(
      await resolveTxVersion(silentNode(), {
        version: 1,
        signing: { feePayer: "wallet" },
      })
    ).to.equal(1);
  });

  it("lets HPL_TX_VERSION=v0 win over a keypair fee payer", async () => {
    process.env.HPL_TX_VERSION = "v0";
    expect(
      await resolveTxVersion(silentNode(), { signing: { feePayer: "keypair" } })
    ).to.equal(0);
  });

  it("keeps a wallet fee payer on v0 under HPL_TX_VERSION=v1", async () => {
    process.env.HPL_TX_VERSION = "v1";
    expect(
      await resolveTxVersion(silentNode(), { signing: { feePayer: "wallet" } })
    ).to.equal(0);
  });
});
