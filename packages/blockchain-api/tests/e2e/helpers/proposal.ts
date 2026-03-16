import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  init as initProposal,
  proposalKey,
  PROGRAM_ID as PROPOSAL_PROGRAM_ID,
} from "@helium/proposal-sdk";
import {
  init as initStateController,
  resolutionSettingsKey,
  settings,
} from "@helium/state-controller-sdk";
import {
  init as initOrg,
  organizationKey,
  proposalKey as orgProposalKey,
} from "@helium/organization-sdk";
import { init as initHsd, daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { TestCtx } from "./context";
import { sendAndConfirmInstructions } from "./tx";
import BN from "bn.js";

interface CreateProposalOptions {
  name: string;
  choices?: Array<{ name: string; uri: string | null }>;
  maxChoicesPerVoter?: number;
  /** Voting duration in seconds (default: 3600 = 1 hour) */
  votingDurationSecs?: number;
}

export interface ProposalSetup {
  proposalConfig: PublicKey;
  proposal: PublicKey;
  registrar: PublicKey;
  resolutionSettings: PublicKey;
  organization?: PublicKey;
}

/**
 * Derives the ProposalConfig PDA.
 * Seeds: ["proposal_config", name]
 */
function proposalConfigKey(
  name: string,
  programId: PublicKey = PROPOSAL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("proposal_config"), Buffer.from(name, "utf-8")],
    programId
  );
}

/**
 * Creates a test proposal on Surfpool for voting tests.
 *
 * Setup flow:
 * 1. Creates ResolutionSettings with offsetFromStartTs for voting duration
 * 2. Discovers the HNT registrar from mainnet fork
 * 3. Creates a ProposalConfig with resolutionSettings as stateController
 * 4. Creates a Proposal with Yes/No choices
 * 5. Moves proposal to voting state
 */
export async function createTestProposal(
  ctx: TestCtx,
  options: CreateProposalOptions
): Promise<ProposalSetup> {
  // Create a signing provider using the test context's connection and payer
  const wallet = new Wallet(ctx.payer);
  const provider = new AnchorProvider(
    ctx.connection,
    wallet,
    AnchorProvider.defaultOptions()
  );

  const hsdProgram = await initHsd(provider);
  const proposalProgram = await initProposal(provider);
  const stateControllerProgram = await initStateController(provider);

  // Get HNT DAO registrar (exists on mainnet fork)
  const [daoK] = daoKey(HNT_MINT);
  const dao = await hsdProgram.account.daoV0.fetch(daoK);
  const registrar = dao.registrar;

  // Keep names short to avoid max seed length (32 bytes)
  const shortId = Math.random().toString(36).substring(2, 8);
  const configName = `tc-${shortId}`;
  const resolutionName = `rs-${shortId}`;

  // Voting duration (default 1 hour)
  const votingDuration = new BN(options.votingDurationSecs ?? 3600);

  const [resolutionSettingsPda] = resolutionSettingsKey(resolutionName);
  const resolutionSettingsNodes = settings().offsetFromStartTs(votingDuration).build();
  const [proposalConfig] = proposalConfigKey(configName);
  const seed = Buffer.from(options.name, "utf-8");
  const [proposalPubkey] = proposalKey(ctx.payer.publicKey, seed);

  // Batch 1: ResolutionSettings + ProposalConfig (independent accounts)
  const initResolutionIx = await stateControllerProgram.methods
    .initializeResolutionSettingsV0({
      name: resolutionName,
      settings: { nodes: resolutionSettingsNodes },
    })
    .accounts({
      payer: ctx.payer.publicKey,
      resolutionSettings: resolutionSettingsPda,
    })
    .instruction();

  const initConfigIx = await proposalProgram.methods
    .initializeProposalConfigV0({
      name: configName,
      voteController: registrar,
      stateController: resolutionSettingsPda,
      onVoteHook: PublicKey.default,
      authority: ctx.payer.publicKey,
    })
    .accounts({
      payer: ctx.payer.publicKey,
      owner: ctx.payer.publicKey,
      proposalConfig,
    })
    .instruction();

  await sendAndConfirmInstructions(ctx.connection, ctx.payer, [
    initResolutionIx,
    initConfigIx,
  ]);

  // Batch 2: Proposal + move to voting (proposal must exist for updateState)
  const initProposalIx = await proposalProgram.methods
    .initializeProposalV0({
      seed,
      maxChoicesPerVoter: options.maxChoicesPerVoter ?? 1,
      name: options.name,
      uri: "https://test.example.com",
      choices: options.choices ?? [
        { name: "Yes", uri: null },
        { name: "No", uri: null },
      ],
      tags: ["test"],
    })
    .accounts({
      proposal: proposalPubkey,
      proposalConfig,
      payer: ctx.payer.publicKey,
      namespace: ctx.payer.publicKey,
      owner: ctx.payer.publicKey,
    })
    .instruction();

  await sendAndConfirmInstructions(ctx.connection, ctx.payer, [initProposalIx]);

  // Batch 3: Move to voting (proposal must exist on-chain for resolver)
  const now = Math.floor(Date.now() / 1000);
  const updateStateIx = await stateControllerProgram.methods
    .updateStateV0({
      newState: {
        voting: { startTs: new BN(now) },
      },
    })
    .accounts({
      proposal: proposalPubkey,
      proposalConfig,
      resolutionSettings: resolutionSettingsPda,
    })
    .instruction();

  await sendAndConfirmInstructions(ctx.connection, ctx.payer, [updateStateIx]);

  return {
    proposalConfig,
    proposal: proposalPubkey,
    registrar,
    resolutionSettings: resolutionSettingsPda,
  };
}

/**
 * Creates a test proposal within an organization on Surfpool.
 *
 * Unlike createTestProposal which creates standalone proposals,
 * this creates proposals through the organization program so they
 * can be iterated by relinquishPositionVotes.
 *
 * Setup flow:
 * 1. Creates ResolutionSettings + ProposalConfig (shared with createTestProposal)
 * 2. Creates an Organization with the test payer as authority
 * 3. Creates a Proposal through the organization (indexed by org.numProposals)
 * 4. Moves proposal to voting state
 */
export async function createTestOrganizationProposal(
  ctx: TestCtx,
  options: CreateProposalOptions
): Promise<ProposalSetup> {
  const wallet = new Wallet(ctx.payer);
  const provider = new AnchorProvider(
    ctx.connection,
    wallet,
    AnchorProvider.defaultOptions()
  );

  const hsdProgram = await initHsd(provider);
  const proposalProgram = await initProposal(provider);
  const stateControllerProgram = await initStateController(provider);
  const orgProgram = await initOrg(provider);

  // Get HNT DAO registrar (exists on mainnet fork)
  const [daoK] = daoKey(HNT_MINT);
  const dao = await hsdProgram.account.daoV0.fetch(daoK);
  const registrar = dao.registrar;

  const shortId = Math.random().toString(36).substring(2, 8);
  const configName = `tc-${shortId}`;
  const resolutionName = `rs-${shortId}`;
  const orgName = `to-${shortId}`;

  const votingDuration = new BN(options.votingDurationSecs ?? 3600);

  const [resolutionSettingsPda] = resolutionSettingsKey(resolutionName);
  const resolutionSettingsNodes = settings()
    .offsetFromStartTs(votingDuration)
    .build();
  const [proposalConfig] = proposalConfigKey(configName);
  const [organizationPubkey] = organizationKey(orgName);
  const [proposalPubkey] = orgProposalKey(organizationPubkey, 0);

  // Batch 1: ResolutionSettings + ProposalConfig + Organization (all independent)
  const initResolutionIx = await stateControllerProgram.methods
    .initializeResolutionSettingsV0({
      name: resolutionName,
      settings: { nodes: resolutionSettingsNodes },
    })
    .accounts({
      payer: ctx.payer.publicKey,
      resolutionSettings: resolutionSettingsPda,
    })
    .instruction();

  const initConfigIx = await proposalProgram.methods
    .initializeProposalConfigV0({
      name: configName,
      voteController: registrar,
      stateController: resolutionSettingsPda,
      onVoteHook: PublicKey.default,
      authority: ctx.payer.publicKey,
    })
    .accounts({
      payer: ctx.payer.publicKey,
      owner: ctx.payer.publicKey,
      proposalConfig,
    })
    .instruction();

  const initOrgIx = await orgProgram.methods
    .initializeOrganizationV0({
      name: orgName,
      authority: ctx.payer.publicKey,
      defaultProposalConfig: proposalConfig,
      proposalProgram: PROPOSAL_PROGRAM_ID,
      uri: "https://test.example.com/org",
    })
    .accounts({
      payer: ctx.payer.publicKey,
      organization: organizationPubkey,
    })
    .instruction();

  await sendAndConfirmInstructions(ctx.connection, ctx.payer, [
    initResolutionIx,
    initConfigIx,
    initOrgIx,
  ]);

  // Batch 2: Proposal via org (requires org + config to exist)
  const initProposalIx = await orgProgram.methods
    .initializeProposalV0({
      name: options.name,
      uri: "https://test.example.com",
      maxChoicesPerVoter: options.maxChoicesPerVoter ?? 1,
      choices: options.choices ?? [
        { name: "Yes", uri: null },
        { name: "No", uri: null },
      ],
      tags: ["test"],
    })
    .accounts({
      payer: ctx.payer.publicKey,
      authority: ctx.payer.publicKey,
      owner: ctx.payer.publicKey,
      proposal: proposalPubkey,
      proposalConfig,
      organization: organizationPubkey,
      proposalProgram: PROPOSAL_PROGRAM_ID,
    })
    .instruction();

  await sendAndConfirmInstructions(ctx.connection, ctx.payer, [initProposalIx]);

  // Batch 3: Move to voting (proposal must exist on-chain for resolver)
  const now = Math.floor(Date.now() / 1000);
  const updateStateIx = await stateControllerProgram.methods
    .updateStateV0({
      newState: {
        voting: { startTs: new BN(now) },
      },
    })
    .accounts({
      proposal: proposalPubkey,
      proposalConfig,
      resolutionSettings: resolutionSettingsPda,
    })
    .instruction();

  await sendAndConfirmInstructions(ctx.connection, ctx.payer, [updateStateIx]);

  return {
    proposalConfig,
    proposal: proposalPubkey,
    registrar,
    resolutionSettings: resolutionSettingsPda,
    organization: organizationPubkey,
  };
}
