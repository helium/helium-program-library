import { createHash } from "crypto";

export function generateTransactionTag(params: {
  type: string;
  [key: string]: any;
}): string {
  const { type, ...otherParams } = params;

  const sortedParams = Object.keys(otherParams)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = otherParams[key];
        return acc;
      },
      {} as Record<string, any>,
    );

  const paramString = JSON.stringify({ type, ...sortedParams });

  const hash = createHash("sha256")
    .update(paramString)
    .digest("hex")
    .substring(0, 12);

  return `${type}_${hash}`;
}

export const TRANSACTION_TYPES = {
  WELCOME_PACK_CREATE: "welcome_pack_create",
  WELCOME_PACK_CLAIM: "welcome_pack_claim",
  WELCOME_PACK_DELETE: "welcome_pack_delete",
  REMOVE_SPLIT: "remove_split",
  ADD_SPLIT: "add_split",
  TOKEN_TRANSFER: "token_transfer",
  TOKEN_BURN: "token_burn",
  MEMO: "memo",
  HOTSPOT_TRANSFER: "hotspot_transfer",
  HOTSPOT_BURN: "hotspot_burn",
  HOTSPOT_REASSERT: "hotspot_reassert",
  HOTSPOT_UPDATE: "hotspot_update",
  BANK_SEND: "bank_send",
  SWAP: "swap",
  UPDATE_REWARDS_DESTINATION: "update_rewards_destination",
  REWARD_CONTRACT_CREATE: "reward_contract_create",
  REWARD_CONTRACT_DELETE: "reward_contract_delete",
  REWARD_CONTRACT_CLAIM: "reward_contract_claim",
  MIGRATION: "migration",
  MINT_DATA_CREDITS: "mint_data_credits",
  DELEGATE_DATA_CREDITS: "delegate_data_credits",
  BURN_DATA_CREDITS: "burn_data_credits",

  // Squads v4 multisig
  SQUADS_PROPOSAL_APPROVE: "squads_proposal_approve",
  SQUADS_PROPOSAL_REJECT: "squads_proposal_reject",
  SQUADS_PROPOSAL_CANCEL: "squads_proposal_cancel",
  SQUADS_PROPOSAL_EXECUTE: "squads_proposal_execute",
  SQUADS_CONFIG_CHANGE: "squads_config_change",

  // Squads v3 multisig
  SQUADS_V3_PROPOSAL_APPROVE: "squads_v3_proposal_approve",
  SQUADS_V3_PROPOSAL_REJECT: "squads_v3_proposal_reject",
  SQUADS_V3_PROPOSAL_CANCEL: "squads_v3_proposal_cancel",
  SQUADS_V3_PROPOSAL_EXECUTE: "squads_v3_proposal_execute",
  SQUADS_V3_CONFIG_CHANGE: "squads_v3_config_change",

  // Squads propose mode of the action endpoints
  TOKEN_TRANSFER_PROPOSAL: "token_transfer_proposal",
  TOKEN_BURN_PROPOSAL: "token_burn_proposal",
  BURN_DATA_CREDITS_PROPOSAL: "burn_data_credits_proposal",
  DELEGATE_DATA_CREDITS_PROPOSAL: "delegate_data_credits_proposal",
  HOTSPOT_BURN_PROPOSAL: "hotspot_burn_proposal",
  HOTSPOT_TRANSFER_PROPOSAL: "hotspot_transfer_proposal",

  // Governance - Position Management
  POSITION_CREATE: "position_create",
  POSITION_CLOSE: "position_close",
  POSITION_EXTEND: "position_extend",
  POSITION_FLIP_LOCKUP: "position_flip_lockup",
  POSITION_RESET_LOCKUP: "position_reset_lockup",
  POSITION_SPLIT: "position_split",
  POSITION_TRANSFER: "position_transfer",
  POSITION_TRANSFER_OWNERSHIP: "position_transfer_ownership",

  // Governance - Delegation
  DELEGATION_DELEGATE: "delegation_delegate",
  DELEGATION_EXTEND: "delegation_extend",
  DELEGATION_UNDELEGATE: "delegation_undelegate",
  DELEGATION_CLAIM_REWARDS: "delegation_claim_rewards",

  // Governance - Voting
  VOTING_VOTE: "voting_vote",
  VOTING_RELINQUISH: "voting_relinquish",
  VOTING_RELINQUISH_ALL: "voting_relinquish_all",

  // Governance - Proxy
  PROXY_ASSIGN: "proxy_assign",
  PROXY_UNASSIGN: "proxy_unassign",
} as const;

export type TransactionType =
  (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];
