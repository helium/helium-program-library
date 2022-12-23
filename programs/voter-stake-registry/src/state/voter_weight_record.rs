use anchor_lang::prelude::*;
use spl_governance_addin_api::voter_weight::VoterWeightAction as GovVoterWeightAction;

/// VoterWeightAction enum as defined in spl-governance-addin-api
/// It's redefined here for Anchor to export it to IDL
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq)]
pub enum VoterWeightAction {
  /// Cast vote for a proposal. Target: Proposal
  CastVote,

  /// Comment a proposal. Target: Proposal
  CommentProposal,

  /// Create Governance within a realm. Target: Realm
  CreateGovernance,

  /// Create a proposal for a governance. Target: Governance
  CreateProposal,

  /// Signs off a proposal for a governance. Target: Proposal
  /// Note: SignOffProposal is not supported in the current version
  SignOffProposal,
}

impl From<VoterWeightAction> for GovVoterWeightAction {
  fn from(value: VoterWeightAction) -> Self {
    match value {
      VoterWeightAction::CastVote => GovVoterWeightAction::CastVote,
      VoterWeightAction::CommentProposal => GovVoterWeightAction::CommentProposal,
      VoterWeightAction::CreateGovernance => GovVoterWeightAction::CreateGovernance,
      VoterWeightAction::CreateProposal => GovVoterWeightAction::CreateProposal,
      VoterWeightAction::SignOffProposal => GovVoterWeightAction::SignOffProposal,
    }
  }
}
