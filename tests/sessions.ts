import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Sessions } from "../target/types/sessions";
import { queueAuthorityKey, init, sessionKey, sessionManagerKey, PROGRAM_ID } from "../packages/sessions-sdk/src";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { init as initTuktuk, nextAvailableTaskIds, runTask, taskKey, taskQueueAuthorityKey, taskQueueKey, taskQueueNameMappingKey, tuktukConfigKey } from "@helium/tuktuk-sdk";
import { random } from "./utils/string";
import { sendInstructions } from "@helium/spl-utils";

describe("sessions", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let program: Program<Sessions>;
  let tuktukProgram: Program<Tuktuk>;
  let taskQueue: PublicKey;
  let queueAuthority: PublicKey;
  let name: string;
  const crankReward: anchor.BN = new anchor.BN(100);

  before(async () => {
    name = random(10);
    program = await init(provider, PROGRAM_ID, anchor.workspace.Sessions.idl);
    tuktukProgram = await initTuktuk(provider);
    const sessionManager = await program.account.sessionManagerV0.fetchNullable(sessionManagerKey()[0]);
    if (sessionManager) {
      taskQueue = sessionManager.taskQueue;
    } else {
      const [tuktukConfig] = tuktukConfigKey()
      if (
        !(await tuktukProgram.account.tuktukConfigV0.fetchNullable(
          tuktukConfig
        ))
      ) {
        await tuktukProgram.methods
          .initializeTuktukConfigV0({
            minDeposit: new anchor.BN(100000000),
          })
          .accounts({
            authority: me,
          })
          .rpc();
      }
      const config = await tuktukProgram.account.tuktukConfigV0.fetch(
        tuktukConfig
      );
      const nextTaskQueueId = config.nextTaskQueueId;
      taskQueue = taskQueueKey(tuktukConfig, nextTaskQueueId)[0];
      await tuktukProgram.methods
        .initializeTaskQueueV0({
          name,
          minCrankReward: crankReward,
          capacity: 100,
          lookupTables: [],
          staleTaskAge: 10000,
        })
        .accounts({
          tuktukConfig,
          payer: me,
          updateAuthority: me,
          taskQueue,
          taskQueueNameMapping: taskQueueNameMappingKey(tuktukConfig, name)[0],
        })
        .rpc();

      [queueAuthority] = queueAuthorityKey();
      await tuktukProgram.methods
        .addQueueAuthorityV0()
        .accounts({
          payer: me,
          queueAuthority,
          taskQueue,
        })
        .rpc();
    }
  });

  it("initializes a session manager", async () => {
    const [sessionManager] = sessionManagerKey();
    const maxSessionExpiration = 3600; // 1 hour

    const sessionManagerAcc1 = await program.account.sessionManagerV0.fetchNullable(sessionManager);
    if (!sessionManagerAcc1) {
      await program.methods
        .initializeSessionManagerV0({
          maxSessionExpirationTs: new anchor.BN(maxSessionExpiration),
        })
        .accounts({
          authority: me,
          taskQueue,
        })
        .rpc();
    }

    const sessionManagerAcc = await program.account.sessionManagerV0.fetch(sessionManager);
    expect(sessionManagerAcc.authority.toBase58()).to.eq(me.toBase58());
    expect(sessionManagerAcc.taskQueue.toBase58()).to.eq(taskQueue.toBase58());
    expect(sessionManagerAcc.maxSessionExpirationTs.toNumber()).to.eq(maxSessionExpiration);
  });

  describe("with session manager", () => {
    let sessionManager: PublicKey;
    let taskId: number;
    let task: PublicKey;

    beforeEach(async () => {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
      taskId = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)[0];
      task = taskKey(taskQueue, taskId)[0];
      [sessionManager] = sessionManagerKey();
      const sessionManagerAcc = await program.account.sessionManagerV0.fetchNullable(sessionManager);
      if (!sessionManagerAcc) {
        await program.methods
          .initializeSessionManagerV0({
            maxSessionExpirationTs: new anchor.BN(3600),
          })
          .accounts({
            authority: me,
            taskQueue,
          })
          .rpc();
      }
    });

    it("creates a session", async () => {
      const wallet = Keypair.generate();
      const tempAuthority = Keypair.generate();
      const rentRefund = Keypair.generate();
      const [session] = sessionKey("MyHelium", wallet.publicKey);

      console.log("session", session.toBase58());
      await program.methods
        .initializeSessionV0({
          expirationSeconds: new anchor.BN(1800), // 30 minutes
          application: "MyHelium",
          permissions: ["LocationAssert"],
          taskId,
        })
        .accounts({
          sessionManager,
          wallet: wallet.publicKey,
          temporaryAuthority: tempAuthority.publicKey,
          rentRefund: rentRefund.publicKey,
          task,
        })
        .signers([wallet])
        .rpc({ skipPreflight: true });

      const sessionAcc = await program.account.sessionV0.fetch(session);
      expect(sessionAcc.wallet.toBase58()).to.eq(wallet.publicKey.toBase58());
      expect(sessionAcc.temporaryAuthority.toBase58()).to.eq(tempAuthority.publicKey.toBase58());
      expect(sessionAcc.application).to.eq("MyHelium");
      expect(sessionAcc.permissions).to.deep.eq(["LocationAssert"]);
      expect(sessionAcc.rentRefund.toBase58()).to.eq(rentRefund.publicKey.toBase58());

      // Expiration should be roughly 30 minutes from now
      const now = Math.floor(Date.now() / 1000);
      expect(sessionAcc.expirationTs.toNumber()).to.be.approximately(now + 1800, 5);
    });

    describe("with session", () => {
      let session: PublicKey;
      const wallet = Keypair.generate();
      const tempAuthority = Keypair.generate();
      const rentRefund = Keypair.generate();

      beforeEach(async () => {
        [session] = sessionKey("MyHelium", wallet.publicKey);

        // Create a session that expires in 1 second
        await program.methods
          .initializeSessionV0({
            expirationSeconds: new anchor.BN(1),
            application: "MyHelium",
            permissions: ["LocationAssert"],
            taskId,
          })
          .accounts({
            sessionManager,
            wallet: wallet.publicKey,
            temporaryAuthority: tempAuthority.publicKey,
            rentRefund: rentRefund.publicKey,
            task,
          })
          .signers([wallet])
          .rpc();
      })

      it("closes an expired session", async () => {
        // Wait for session to expire
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await sendInstructions(provider, await runTask({
          program: tuktukProgram,
          task,
          crankTurner: me,
        }));

        const sessionAccount = await program.account.sessionV0.fetchNullable(session);
        expect(sessionAccount).to.be.null;
      });

      it("fails to close an unexpired session", async () => {
        // Try to close the session before expiration
        try {
          await program.methods
            .closeSessionV0()
            .accounts({
              session,
            })
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.include("A raw constraint was violated");
        }

        // Verify session still exists
        const sessionAccount = await provider.connection.getAccountInfo(session);
        expect(sessionAccount).to.not.be.null;
      });
    })
  });
});
