import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import Fastify from "fastify";
import { ATTESTATION, registerLedgerMigrate } from "../src/ledgerMigrateRoute";

describe("POST /ledger/migrate", () => {
  const feePayer = Keypair.generate().publicKey;
  const from = Keypair.generate().publicKey;
  const to = Keypair.generate().publicKey;

  const setup = () => {
    const calls: [PublicKey, PublicKey][] = [];
    const server = Fastify();
    registerLedgerMigrate(server, {
      feePayer,
      getMigrateTransactions: async (f, t) => {
        calls.push([f, t]);
        return [];
      },
    });
    return { server, calls };
  };

  const post = (server: ReturnType<typeof Fastify>, body: object) =>
    server.inject({ method: "POST", url: "/ledger/migrate", payload: body });

  it("builds transactions for a valid request", async () => {
    const { server, calls } = setup();
    const res = await post(server, {
      from: from.toBase58(),
      to: to.toBase58(),
      attestation: ATTESTATION,
    });
    expect(res.statusCode).to.equal(200);
    expect(res.json()).to.deep.equal([]);
    expect(calls).to.have.length(1);
    expect(calls[0][0].equals(from)).to.equal(true);
    expect(calls[0][1].equals(to)).to.equal(true);
  });

  it("rejects a wrong attestation before building anything", async () => {
    const { server, calls } = setup();
    const res = await post(server, {
      from: from.toBase58(),
      to: to.toBase58(),
      attestation: "nope",
    });
    expect(res.statusCode).to.equal(400);
    expect(res.json().error).to.equal("Invalid attestation");
    expect(calls).to.have.length(0);
  });

  it("rejects the fee payer as source before building anything", async () => {
    const { server, calls } = setup();
    const res = await post(server, {
      from: feePayer.toBase58(),
      to: to.toBase58(),
      attestation: ATTESTATION,
    });
    expect(res.statusCode).to.equal(400);
    expect(res.json().error).to.equal("Invalid source wallet");
    expect(calls).to.have.length(0);
  });

  it("rejects the fee payer as destination before building anything", async () => {
    const { server, calls } = setup();
    const res = await post(server, {
      from: from.toBase58(),
      to: feePayer.toBase58(),
      attestation: ATTESTATION,
    });
    expect(res.statusCode).to.equal(400);
    expect(res.json().error).to.equal("Invalid destination wallet");
    expect(calls).to.have.length(0);
  });
});
