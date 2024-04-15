import { BN, IdlAccounts, IdlTypes } from '@coral-xyz/anchor'
import { HeliumSubDaos } from '@helium/idls/lib/types/helium_sub_daos'
import { VoterStakeRegistry as HeliumVoterStakeRegistry } from '@helium/idls/lib/types/voter_stake_registry'
import { NftDelegation } from '@helium/modular-governance-idls/lib/types/nft_delegation'
import { PublicKey } from '@solana/web3.js'

export type VotingMintConfig = IdlTypes<HeliumVoterStakeRegistry>['VotingMintConfigV0']
type RegistrarV0 = IdlAccounts<HeliumVoterStakeRegistry>['registrar']
export type Lockup = IdlTypes<HeliumVoterStakeRegistry>['Lockup']
export type PositionV0 = IdlAccounts<HeliumVoterStakeRegistry>['positionV0']
export type DelegatedPositionV0 = IdlAccounts<HeliumSubDaos>['delegatedPositionV0']
export type DelegationV0 =
  IdlAccounts<NftDelegation>["delegationV0"];
export interface Registrar extends RegistrarV0 {
  votingMints: VotingMintConfig[]
}
export interface Position extends Omit<PositionV0, 'lockup'> {
  lockup: Lockup
}
export type Delegation = DelegationV0 & { address: PublicKey };
export interface PositionWithMeta extends Position {
  pubkey: PublicKey
  isDelegated: boolean
  // This position could by someone elses position, but was delegated to me
  isVotingDelegatedToMe: boolean
  delegatedSubDao: PublicKey | null
  hasRewards: boolean
  hasGenesisMultiplier: boolean
  votingPower: BN
  votingMint: VotingMintConfig
  votingDelegation: Delegation | null
}
export type LockupKind = IdlTypes<HeliumVoterStakeRegistry>['LockupKind']
/* export type InitializePositionV0Args = IdlTypes<HeliumVoterStakeRegistry>['InitializePositionArgsV0']
 */
export type SubDao = IdlAccounts<HeliumSubDaos>['subDaoV0']
export interface SubDaoWithMeta extends Omit<SubDao, 'dntMint'> {
  pubkey: PublicKey
  dntMetadata: {
    name: string;
    symbol: string;
    uri: string;
    json: any;
  }
}
