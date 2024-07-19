import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import {
  SystemProgram,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import chai from "chai";
import { init as initIotRoutingManager } from "../packages/iot-routing-manager-sdk/src";
import { init as initHeliumEntityManager, sharedMerkleKey } from "../packages/helium-entity-manager-sdk/src";
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
import { getAccount } from "@solana/spl-token";
import { random } from "./utils/string";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";

chai.use(chaiAsPromised);

describe("iot-routing-manager", () => {
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


    const dataCredits = await initTestDataCredits(dcProgram, provider);
    dcMint = dataCredits.dcMint;
    ({ dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dataCredits.dcMint
    ));
    ({ subDao } = await initTestSubdao({
      hsdProgram,
      provider,
      authority: me,
      dao,
      numTokens: new anchor.BN("500000000000000"),
    }));

    const approve = await hemProgram.methods
      .approveProgramV0({
        programId: irmProgram.programId,
      })
      .accounts({ dao });

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
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accounts({
        updateAuthority: me,
        netIdAuthority: me,
        subDao,
      })
      .rpcAndKeys({ skipPreflight: true });

    const routingManagerAcc = await irmProgram.account.iotRoutingManagerV0.fetch(routingManager!);

    expect(routingManagerAcc.updateAuthority.toBase58()).to.eq(me.toBase58());
    expect(routingManagerAcc.netIdAuthority.toBase58()).to.eq(me.toBase58());
  });

  describe("with a routing manager", async () => {
    let routingManager: PublicKey;
    let merkle: Keypair;
    beforeEach(async () => {
      const {
        pubkeys: { routingManager: routingManagerK },
      } = await irmProgram.methods
        .initializeRoutingManagerV0({
          metadataUrl: "https://some/url",
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accounts({
          updateAuthority: me,
          netIdAuthority: me,
          subDao,
        })
        .rpcAndKeys({ skipPreflight: true });
      routingManager = routingManagerK!
    });

    it("should initialize a net id", async () => {
      const {
        pubkeys: { netId },
      } = await irmProgram.methods
        .initializeNetIdV0({
          netId: new anchor.BN(1),
        })
        .accounts({
          authority: me,
          routingManager,
        })
        .rpcAndKeys({ skipPreflight: true });

      const netIdAcc = await irmProgram.account.netIdV0.fetch(netId!);
      expect(netIdAcc.authority.toBase58()).to.eq(me.toBase58());
      expect(netIdAcc.id.toNumber()).to.eq(1);
    })

    describe("with net id", async () => {
      let netId: PublicKey;
      beforeEach(async () => {
        const {
          pubkeys: { netId: netIdK },
        } = await irmProgram.methods
          .initializeNetIdV0({
            netId: new anchor.BN(1),
          })
          .accounts({
            authority: me,
            routingManager,
          })
          .rpcAndKeys({ skipPreflight: true });
        netId = netIdK!;
      });

      it ("should initialize an organization", async () => {
        const {
          pubkeys: { organization },
        } = await irmProgram.methods
          .initializeOrganizationV0({
            oui: new anchor.BN(2),
            escrowKeyOverride: null,
          })
          .preInstructions(
            [ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 })]
          )
          .accounts({
            authority: me,
            netId,
          })
          .rpcAndKeys({ skipPreflight: true });

        const organizationAcc = await irmProgram.account.organizationV0.fetch(organization!);
        expect(organizationAcc.authority.toBase58()).to.eq(me.toBase58());
        expect(organizationAcc.oui.toNumber()).to.eq(2);
        expect(organizationAcc.escrowKey.toString()).to.eq("OUI_2");
        expect(organizationAcc.netId.toBase58()).to.eq(netId.toBase58());
        expect(organizationAcc.routingManager.toBase58()).to.eq(routingManager.toBase58());
      })
    })
  });
});
