import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import chai from "chai";
import { init as initIotRoutingManager } from "../packages/iot-routing-manager-sdk/src";
import { init as initHeliumEntityManager } from "../packages/helium-entity-manager-sdk/src";
import { init as initVsr } from "../packages/voter-stake-registry-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { IotRoutingManager } from "../target/types/iot_routing_manager";
import { VoterStakeRegistry } from "../target/types/voter_stake_registry";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  ensureIrmIdl,
  ensureDCIdl,
  ensureHSDIdl,
  ensureVSRIdl,
  initTestDataCredits,
  initSharedMerkle,
  ensureHEMIdl,
} from "./utils/fixtures";
const { expect } = chai;
import chaiAsPromised from "chai-as-promised";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";

chai.use(chaiAsPromised);

describe("iot-routing-manager", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;
  let irmProgram: Program<IotRoutingManager>;
  let vsrProgram: Program<VoterStakeRegistry>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let dao: PublicKey;
  let subDao: PublicKey;
  let iotMint: PublicKey | undefined;
  let dcMint: PublicKey;
  let programApproval: PublicKey;

  beforeEach(async () => {
    dcProgram = await initDataCredits(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );

    ensureDCIdl(dcProgram);

    hsdProgram = await initHeliumSubDaos(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );

    ensureHSDIdl(hsdProgram);

    hemProgram = await initHeliumEntityManager(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );
    ensureHEMIdl(hemProgram);

    irmProgram = await initIotRoutingManager(
      provider,
      anchor.workspace.IotRoutingManager.programId,
      anchor.workspace.IotRoutingManager.idl
    );
    ensureIrmIdl(irmProgram);

    vsrProgram = await initVsr(
      provider,
      anchor.workspace.VoterStakeRegistry.programId,
      anchor.workspace.VoterStakeRegistry.idl
    );
    ensureVSRIdl(vsrProgram);

    const dataCredits = await initTestDataCredits(dcProgram, provider);
    dcMint = dataCredits.dcMint;
    ({ dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dataCredits.dcMint
    ));

    ({ subDao, mint: iotMint } = await initTestSubdao({
      hsdProgram,
      vsrProgram,
      provider,
      authority: me,
      dao,
      numTokens: new anchor.BN("500000000000000"),
    }));

    const approve = await hemProgram.methods
      .approveProgramV0({
        programId: irmProgram.programId,
      })
      .accountsPartial({ dao });

    programApproval = (await approve.pubkeys()).programApproval!;
    await approve.rpc({ skipPreflight: true });

    await initSharedMerkle(hemProgram);
  });

  it("should initialize a routing manager", async () => {
    const {
      pubkeys: { routingManager },
    } = await irmProgram.methods
      .initializeRoutingManagerV0({
        metadataUrl: "https://some/url",
        devaddrFeeUsd: new anchor.BN(100_000000),
        ouiFeeUsd: new anchor.BN(100_000000),
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accountsPartial({
        updateAuthority: me,
        netIdAuthority: me,
        dcMint: dcMint,
        subDao,
        dao,
      })
      .rpcAndKeys({ skipPreflight: true });

    const routingManagerAcc =
      await irmProgram.account.iotRoutingManagerV0.fetch(routingManager!);

    expect(routingManagerAcc.updateAuthority.toBase58()).to.eq(me.toBase58());
    expect(routingManagerAcc.netIdAuthority.toBase58()).to.eq(me.toBase58());
  });

  describe("with a routing manager", async () => {
    let routingManager: PublicKey;

    beforeEach(async () => {
      const {
        pubkeys: { routingManager: routingManagerK },
      } = await irmProgram.methods
        .initializeRoutingManagerV0({
          metadataUrl: "https://some/url",
          devaddrFeeUsd: new anchor.BN(100_000000),
          ouiFeeUsd: new anchor.BN(100_000000),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({
          updateAuthority: me,
          netIdAuthority: me,
          subDao,
          dao,
        })
        .rpcAndKeys({ skipPreflight: true });
      routingManager = routingManagerK!;
    });

    it("should initialize a net id", async () => {
      const {
        pubkeys: { netId },
      } = await irmProgram.methods
        .initializeNetIdV0({
          netId: 1,
        })
        .accountsPartial({
          authority: me,
          routingManager,
        })
        .rpcAndKeys({ skipPreflight: true });

      const netIdAcc = await irmProgram.account.netIdV0.fetch(netId!);
      expect(netIdAcc.authority.toBase58()).to.eq(me.toBase58());
      expect(netIdAcc.id).to.eq(1);
    });

    describe("with net id", async () => {
      let netId: PublicKey;
      beforeEach(async () => {
        const {
          pubkeys: { netId: netIdK },
        } = await irmProgram.methods
          .initializeNetIdV0({
            netId: 1,
          })
          .accountsPartial({
            authority: me,
            routingManager,
          })
          .rpcAndKeys({ skipPreflight: true });
        netId = netIdK!;
      });

      it("should initialize an organization", async () => {
        const {
          pubkeys: { organization },
        } = await irmProgram.methods
          .initializeOrganizationV0()
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
          ])
          .accountsPartial({
            authority: me,
            netId,
          })
          .rpcAndKeys({ skipPreflight: true });

        const organizationAcc = await irmProgram.account.organizationV0.fetch(
          organization!
        );
        expect(organizationAcc.authority.toBase58()).to.eq(me.toBase58());
        expect(organizationAcc.oui.toNumber()).to.eq(1);
        expect(organizationAcc.escrowKey.toString()).to.eq("OUI_1");
        expect(organizationAcc.netId.toBase58()).to.eq(netId.toBase58());
        expect(organizationAcc.routingManager.toBase58()).to.eq(
          routingManager.toBase58()
        );
      });

      it("should update the net id", async () => {
        await irmProgram.methods
          .updateNetIdV0({
            authority: PublicKey.default,
          })
          .accountsPartial({ netId })
          .rpc();

        const netIdAcc = await irmProgram.account.netIdV0.fetch(netId);
        expect(netIdAcc.authority.toBase58()).to.eq(
          PublicKey.default.toBase58()
        );
      });

      describe("with an organization", () => {
        let organization: PublicKey;
        beforeEach(async () => {
          const {
            pubkeys: { organization: organizationK },
          } = await irmProgram.methods
            .initializeOrganizationV0()
            .preInstructions([
              ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
            ])
            .accountsPartial({
              authority: me,
              netId,
            })
            .rpcAndKeys({ skipPreflight: true });

          organization = organizationK!;

          await irmProgram.methods
            .approveOrganizationV0()
            .accountsPartial({
              organization,
            })
            .rpc({ skipPreflight: true });
        });

        it("should initialize a devaddr constraint", async () => {
          const {
            pubkeys: { devaddrConstraint },
          } = await irmProgram.methods
            .initializeDevaddrConstraintV0({
              numBlocks: 2,
            })
            .accountsPartial({
              organization,
            })
            .rpcAndKeys({ skipPreflight: true });
          const devaddr = await irmProgram.account.devaddrConstraintV0.fetch(
            devaddrConstraint!
          );
          expect(devaddr.startAddr.toNumber()).to.eq(0);
          expect(devaddr.endAddr.toNumber()).to.eq(16);
        });

        it("should update the organization", async () => {
          await irmProgram.methods
            .updateOrganizationV0({
              authority: PublicKey.default,
            })
            .accountsPartial({ organization })
            .rpc();

          const orgAcc = await irmProgram.account.netIdV0.fetch(netId);
          expect(orgAcc.authority.toBase58()).to.eq(
            PublicKey.default.toBase58()
          );
        });
      });
    });

    it("should update the routing manager", async () => {
      await irmProgram.methods
        .updateRoutingManagerV0({
          updateAuthority: PublicKey.default,
          netIdAuthority: PublicKey.default,
          devaddrFeeUsd: new anchor.BN(100_000000),
          ouiFeeUsd: new anchor.BN(100_000000),
        })
        .accountsPartial({
          routingManager,
        })
        .rpc();

      const routingManagerAcc =
        await irmProgram.account.iotRoutingManagerV0.fetch(routingManager);
      expect(routingManagerAcc.updateAuthority.toBase58).to.eq(
        PublicKey.default.toBase58()
      );
      expect(routingManagerAcc.netIdAuthority.toBase58).to.eq(
        PublicKey.default.toBase58()
      );
      expect(routingManagerAcc.devaddrFeeUsd.toNumber()).to.eq(
        new anchor.BN(100_000000).toNumber()
      );
      expect(routingManagerAcc.ouiFeeUsd.toNumber()).to.eq(
        new anchor.BN(100_000000).toNumber()
      );
    });
  });
});
