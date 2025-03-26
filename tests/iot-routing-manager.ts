import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import chai from "chai";
import {
  devaddrConstraintKey,
  init as initIotRoutingManager,
  organizationKey,
} from "../packages/iot-routing-manager-sdk/src";
import {
  init as initHeliumEntityManager,
  keyToAssetKey,
} from "../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { IotRoutingManager } from "../target/types/iot_routing_manager";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  ensureIrmIdl,
  ensureDCIdl,
  ensureHSDIdl,
  initTestDataCredits,
  initSharedMerkle,
  ensureHEMIdl,
} from "./utils/fixtures";
const { expect } = chai;
import chaiAsPromised from "chai-as-promised";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { Keypair } from "@solana/web3.js";

chai.use(chaiAsPromised);

describe("iot-routing-manager", () => {
  const TEST_URL = "https://some/url";
  const DEFAULT_COMPUTE_UNITS = 500000;
  const DEFAULT_FEE_USD = new anchor.BN(100_000000);
  const DEFAULT_DC_AMOUNT = new anchor.BN("10000000000");
  const DEFAULT_NET_ID = 1;

  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;
  let irmProgram: Program<IotRoutingManager>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let dao: PublicKey;
  let subDao: PublicKey;
  let dcMint: PublicKey;
  let merkle: PublicKey;
  let sharedMerkle: PublicKey;

  const initializePrograms = async () => {
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
  };

  const setupDataCredits = async () => {
    const dataCredits = await initTestDataCredits(dcProgram, provider);
    const hntMint = dataCredits.hntMint;
    dcMint = dataCredits.dcMint;

    await dcProgram.methods
      .mintDataCreditsV0({
        dcAmount: DEFAULT_DC_AMOUNT,
        hntAmount: null,
      })
      .accountsPartial({
        dcMint,
        recipient: me,
      })
      .rpc({ skipPreflight: true });

    return { hntMint };
  };

  const setupDaoStructure = async (hntMint: PublicKey) => {
    ({ dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dcMint,
      hntMint
    ));

    ({ subDao } = await initTestSubdao({
      hsdProgram,
      provider,
      authority: me,
      dao,
    }));
  };

  const initializeRoutingManager = async () => {
    const {
      pubkeys: { routingManager },
    } = await irmProgram.methods
      .initializeRoutingManagerV0({
        metadataUrl: TEST_URL,
        devaddrFeeUsd: DEFAULT_FEE_USD,
        ouiFeeUsd: DEFAULT_FEE_USD,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: DEFAULT_COMPUTE_UNITS,
        }),
      ])
      .accountsPartial({
        updateAuthority: me,
        netIdAuthority: me,
        dcMint: dcMint,
        subDao,
        dao,
      })
      .rpcAndKeys({ skipPreflight: true });

    return routingManager!;
  };

  const initializeNetId = async (
    routingManager: PublicKey,
    id = DEFAULT_NET_ID
  ) => {
    const {
      pubkeys: { netId },
    } = await irmProgram.methods
      .initializeNetIdV0({
        netId: id,
      })
      .accountsPartial({
        authority: me,
        routingManager,
      })
      .rpcAndKeys({ skipPreflight: true });

    return netId!;
  };

  const initializeOrganization = async (
    routingManager: PublicKey,
    netId: PublicKey
  ) => {
    const routingManagerAcc =
      await irmProgram.account.iotRoutingManagerV0.fetch(routingManager);
    const nextOuiId = routingManagerAcc.nextOuiId;
    const [organization] = organizationKey(routingManager, nextOuiId);
    const [keyToAsset] = keyToAssetKey(
      dao,
      Buffer.from(`OUI_${nextOuiId.toNumber()}`, "utf-8")
    );

    await irmProgram.methods
      .initializeOrganizationV0()
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: DEFAULT_COMPUTE_UNITS,
        }),
      ])
      .accountsPartial({
        authority: me,
        netId,
        dao,
        merkleTree: merkle,
        sharedMerkle,
        organization,
        keyToAsset,
      })
      .rpc({ skipPreflight: true });

    return organization;
  };

  beforeEach(async () => {
    await initializePrograms();
    const { hntMint } = await setupDataCredits();
    await setupDaoStructure(hntMint);
    const approve = await hemProgram.methods
      .approveProgramV0({
        programId: irmProgram.programId,
      })
      .accountsPartial({ dao });

    await approve.rpc({ skipPreflight: true });
    ({ merkle, sharedMerkle } = await initSharedMerkle(hemProgram));
  });

  it("should initialize a routing manager", async () => {
    const routingManager = await initializeRoutingManager();
    const routingManagerAcc =
      await irmProgram.account.iotRoutingManagerV0.fetch(routingManager);

    expect(routingManagerAcc.updateAuthority.toBase58()).to.eq(me.toBase58());
    expect(routingManagerAcc.netIdAuthority.toBase58()).to.eq(me.toBase58());
  });

  it("should update the routing manager", async () => {
    const routingManager = await initializeRoutingManager();
    await irmProgram.methods
      .updateRoutingManagerV0({
        updateAuthority: PublicKey.default,
        netIdAuthority: PublicKey.default,
        devaddrFeeUsd: DEFAULT_FEE_USD,
        ouiFeeUsd: DEFAULT_FEE_USD,
      })
      .accountsPartial({
        routingManager,
      })
      .rpc();

    const routingManagerAcc =
      await irmProgram.account.iotRoutingManagerV0.fetch(routingManager);

    expect(routingManagerAcc.updateAuthority.toBase58()).to.eq(
      PublicKey.default.toBase58()
    );
    expect(routingManagerAcc.netIdAuthority.toBase58()).to.eq(
      PublicKey.default.toBase58()
    );
    expect(routingManagerAcc.devaddrFeeUsd.toNumber()).to.eq(
      DEFAULT_FEE_USD.toNumber()
    );
    expect(routingManagerAcc.ouiFeeUsd.toNumber()).to.eq(
      DEFAULT_FEE_USD.toNumber()
    );
  });

  describe("with a routing manager", async () => {
    let routingManager: PublicKey;

    beforeEach(async () => {
      routingManager = await initializeRoutingManager();
    });

    it("should initialize a net id", async () => {
      const netId = await initializeNetId(routingManager);
      const netIdAcc = await irmProgram.account.netIdV0.fetch(netId);

      expect(netIdAcc.authority.toBase58()).to.eq(me.toBase58());
      expect(netIdAcc.id).to.eq(DEFAULT_NET_ID);
    });

    describe("with net id", async () => {
      let netId: PublicKey;

      beforeEach(async () => {
        netId = await initializeNetId(routingManager);
      });

      it("should initialize an organization", async () => {
        let routingManagerAcc =
          await irmProgram.account.iotRoutingManagerV0.fetch(routingManager);
        let nextOuiId = routingManagerAcc.nextOuiId;

        const organization = await initializeOrganization(
          routingManager,
          netId
        );
        const organizationAcc = await irmProgram.account.organizationV0.fetch(
          organization
        );

        routingManagerAcc = await irmProgram.account.iotRoutingManagerV0.fetch(
          routingManager
        );

        expect(organizationAcc.authority.toBase58()).to.eq(me.toBase58());
        expect(organizationAcc.oui.toNumber()).to.eq(1);
        expect(organizationAcc.escrowKey.toString()).to.eq("OUI_1");
        expect(organizationAcc.netId.toBase58()).to.eq(netId.toBase58());
        expect(organizationAcc.routingManager.toBase58()).to.eq(
          routingManager.toBase58()
        );
        expect(routingManagerAcc.nextOuiId.toNumber()).to.eq(
          nextOuiId.addn(1).toNumber()
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
          organization = await initializeOrganization(routingManager, netId);

          await irmProgram.methods
            .approveOrganizationV0()
            .accountsPartial({
              organization,
            })
            .rpc({ skipPreflight: true });
        });

        it("should initialize a devaddr constraint", async () => {
          let netIdAcc = await irmProgram.account.netIdV0.fetch(netId);
          let currAddrOffset = netIdAcc.currentAddrOffset;

          const [devaddrConstraint] = devaddrConstraintKey(
            organization,
            currAddrOffset
          );

          await irmProgram.methods
            .initializeDevaddrConstraintV0({
              numBlocks: 2,
            })
            .accountsPartial({
              organization,
              devaddrConstraint,
              netId,
              routingManager,
            })
            .rpc({ skipPreflight: true });

          const devaddrAcc = await irmProgram.account.devaddrConstraintV0.fetch(
            devaddrConstraint
          );
          netIdAcc = await irmProgram.account.netIdV0.fetch(netId);

          expect(devaddrAcc.startAddr.toNumber()).to.eq(0);
          expect(devaddrAcc.endAddr.toNumber()).to.eq(16);
          expect(netIdAcc.currentAddrOffset.toNumber()).to.eq(
            currAddrOffset.addn(16 + 1).toNumber() // 1 is added to avoid overlap
          );
        });

        it("should initialize a delegate", async () => {
          const delegate = Keypair.generate();

          const {
            pubkeys: { organizationDelegate },
          } = await irmProgram.methods
            .initializeOrganizationDelegateV0()
            .accountsPartial({
              organization,
              delegate: delegate.publicKey,
            })
            .rpcAndKeys({ skipPreflight: true });

          const delegateAcc =
            await irmProgram.account.organizationDelegateV0.fetch(
              organizationDelegate
            );

          expect(delegateAcc.delegate.toBase58()).to.eq(
            delegate.publicKey.toBase58()
          );
          expect(delegateAcc.organization.toBase58()).to.eq(
            organization.toBase58()
          );
        });

        it("should update the organization", async () => {
          await irmProgram.methods
            .updateOrganizationV0({
              authority: PublicKey.default,
            })
            .accountsPartial({ organization })
            .rpc();

          const orgAcc = await irmProgram.account.organizationV0.fetch(
            organization
          );
          expect(orgAcc.authority.toBase58()).to.eq(
            PublicKey.default.toBase58()
          );
        });
      });
    });
  });
});
