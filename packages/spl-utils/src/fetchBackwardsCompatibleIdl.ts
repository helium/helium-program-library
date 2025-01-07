import { Provider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";

export async function fetchBackwardsCompatibleIdl(
  programId: PublicKey,
  provider: Provider
) {
  const idl = await Program.fetchIdl(programId, provider);
  // This is an Anchor 0.30+ IDL. Return the old IDLs
  // @ts-ignore
  if (!idl || idl?.address) {
    return IDLS_BY_PROGRAM[programId.toBase58()] || idl;
  }

  return idl;
}

const IDLS_BY_PROGRAM: Record<string, any> = {
  hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR: {
    version: "0.1.12",
    name: "helium_sub_daos",
    instructions: [
      {
        name: "initializeDaoV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dao",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "hnt_mint",
                },
              ],
            },
          },
          {
            name: "hntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hntMintAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "hntFreezeAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "hntCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "hnt_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "dcMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "hstPool",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "delegatorPoolCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "delegator_pool",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "rewardsEscrow",
            isMut: false,
            isSigner: false,
          },
          {
            name: "delegatorPool",
            isMut: true,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeDaoArgsV0",
            },
          },
        ],
      },
      {
        name: "initializeSubDaoV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: true,
            isSigner: false,
            relations: ["authority", "hnt_mint"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "sub_dao",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dnt_mint",
                },
              ],
            },
          },
          {
            name: "hntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntMintAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "subDaoFreezeAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "treasury",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treasuryCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "treasury",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "treasuryManagement",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "treasury_management",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dnt_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "treasury_management_program",
              },
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "treasuryManagementProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeSubDaoArgsV0",
            },
          },
        ],
      },
      {
        name: "updateDaoV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dao",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao.hnt_mint",
                },
              ],
            },
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateDaoArgsV0",
            },
          },
        ],
      },
      {
        name: "updateSubDaoV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "sub_dao",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao.dnt_mint",
                },
              ],
            },
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateSubDaoArgsV0",
            },
          },
        ],
      },
      {
        name: "tempUpdateSubDaoEpochInfo",
        accounts: [
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "sub_dao_epoch_info",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "TempUpdateSubDaoEpochInfoArgs",
                  },
                  path: "args.epoch",
                },
              ],
            },
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "authority",
            isMut: true,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "TempUpdateSubDaoEpochInfoArgs",
            },
          },
        ],
      },
      {
        name: "updateSubDaoVehntV0",
        accounts: [
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "sub_dao",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao.dnt_mint",
                },
              ],
            },
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateSubDaoVeHntArgsV0",
            },
          },
        ],
      },
      {
        name: "trackDcBurnV0",
        accounts: [
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint", "registrar"],
          },
          {
            name: "dcMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "accountPayer",
            isMut: true,
            isSigner: true,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_payer",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "TrackDcBurnArgsV0",
            },
          },
        ],
      },
      {
        name: "calculateUtilityScoreV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["registrar", "hnt_mint"],
          },
          {
            name: "hntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "prevDaoEpochInfo",
            isMut: false,
            isSigner: false,
          },
          {
            name: "daoEpochInfo",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dao_epoch_info",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "CalculateUtilityScoreArgsV0",
                  },
                  path: "args.epoch",
                },
              ],
            },
          },
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "sub_dao_epoch_info",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "CalculateUtilityScoreArgsV0",
                  },
                  path: "args.epoch",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "prevSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "CalculateUtilityScoreArgsV0",
            },
          },
        ],
      },
      {
        name: "issueRewardsV0",
        accounts: [
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["hnt_mint", "delegator_pool", "rewards_escrow"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao", "treasury", "dnt_mint"],
          },
          {
            name: "daoEpochInfo",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dao_epoch_info",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "IssueRewardsArgsV0",
                  },
                  path: "args.epoch",
                },
              ],
            },
            relations: ["dao"],
          },
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "sub_dao_epoch_info",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "IssueRewardsArgsV0",
                  },
                  path: "args.epoch",
                },
              ],
            },
            relations: ["sub_dao"],
          },
          {
            name: "hntCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "hnt_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "hntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treasury",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardsEscrow",
            isMut: true,
            isSigner: false,
          },
          {
            name: "delegatorPool",
            isMut: true,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "IssueRewardsArgsV0",
            },
          },
        ],
      },
      {
        name: "delegateV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "position",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "vsr_program",
              },
            },
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: true,
            isSigner: true,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
            relations: ["proxy_config"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "closingTimeSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "genesisEndSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "delegatedPosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position",
                },
              ],
            },
          },
          {
            name: "vsrProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proxyConfig",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "closeDelegationV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "position",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "vsr_program",
              },
            },
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: true,
            isSigner: true,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "delegatedPosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position",
                },
              ],
            },
            relations: ["position", "sub_dao"],
          },
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "closingTimeSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "genesisEndSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "vsrProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "claimRewardsV0",
        accounts: [
          {
            name: "position",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "vsr_program",
              },
            },
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: true,
            isSigner: true,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["delegator_pool", "dnt_mint", "dao"],
          },
          {
            name: "delegatedPosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position",
                },
              ],
            },
            relations: ["sub_dao"],
          },
          {
            name: "dntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "subDaoEpochInfo",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "sub_dao_epoch_info",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "ClaimRewardsArgsV0",
                  },
                  path: "args.epoch",
                },
              ],
            },
          },
          {
            name: "delegatorPool",
            isMut: true,
            isSigner: false,
          },
          {
            name: "delegatorAta",
            isMut: true,
            isSigner: false,
          },
          {
            name: "delegatorPoolCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "delegator_pool",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "vsrProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ClaimRewardsArgsV0",
            },
          },
        ],
      },
      {
        name: "claimRewardsV1",
        accounts: [
          {
            name: "position",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "vsr_program",
              },
            },
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: true,
            isSigner: true,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["registrar", "hnt_mint", "delegator_pool"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "delegatedPosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position",
                },
              ],
            },
            relations: ["sub_dao"],
          },
          {
            name: "hntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "daoEpochInfo",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dao_epoch_info",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "ClaimRewardsArgsV0",
                  },
                  path: "args.epoch",
                },
              ],
            },
          },
          {
            name: "delegatorPool",
            isMut: true,
            isSigner: false,
          },
          {
            name: "delegatorAta",
            isMut: true,
            isSigner: false,
          },
          {
            name: "delegatorPoolCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "delegator_pool",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "vsrProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ClaimRewardsArgsV0",
            },
          },
        ],
      },
      {
        name: "transferV0",
        accounts: [
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dao",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "deposit_mint",
                },
              ],
            },
            relations: ["registrar"],
          },
          {
            name: "sourcePosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "vsr_program",
              },
            },
            relations: ["registrar", "mint"],
          },
          {
            name: "sourceDelegatedPosition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "source_position",
                },
              ],
            },
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "targetPosition",
            isMut: true,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "targetDelegatedPosition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "target_position",
                },
              ],
            },
          },
          {
            name: "depositMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "sourceVault",
            isMut: true,
            isSigner: false,
          },
          {
            name: "targetVault",
            isMut: true,
            isSigner: false,
          },
          {
            name: "vsrProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "TransferArgsV0",
            },
          },
        ],
      },
      {
        name: "resetLockupV0",
        accounts: [
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "vsr_program",
              },
            },
            relations: ["registrar", "mint"],
          },
          {
            name: "delegatedPosition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position",
                },
              ],
            },
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "vsrProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ResetLockupArgsV0",
            },
          },
        ],
      },
      {
        name: "trackDcOnboardingFeesV0",
        accounts: [
          {
            name: "hemAuth",
            isMut: false,
            isSigner: true,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "rewardable_entity_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "TrackDcOnboardingFeesArgsV0",
                  },
                  path: "args.symbol",
                },
              ],
            },
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "TrackDcOnboardingFeesArgsV0",
            },
          },
        ],
      },
      {
        name: "adminSetDcOnboardingFeesPaid",
        accounts: [
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "AdminSetDcOnboardingFeesPaidArgs",
            },
          },
        ],
      },
      {
        name: "adminSetDcOnboardingFeesPaidEpochInfo",
        accounts: [
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "AdminSetDcOnboardingFeesPaidEpochInfoArgs",
            },
          },
        ],
      },
      {
        name: "switchMobileOpsFund",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "opsFundMobile",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mobileMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "opsFundHnt",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["hnt_mint", "authority"],
          },
          {
            name: "hntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hntCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "hnt_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "initializeHntDelegatorPool",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: true,
            isSigner: false,
            relations: ["authority", "hnt_mint"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "hntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "delegatorPoolCircuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "delegator_pool",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "delegatorPool",
            isMut: true,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "extendExpirationTsV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            relations: ["mint"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
            relations: ["proxy_config"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "delegatedPosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position",
                },
              ],
            },
            relations: ["position", "sub_dao"],
          },
          {
            name: "oldClosingTimeSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "closingTimeSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "genesisEndSubDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "proxyConfig",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "tempResizeAccount",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "account",
            isMut: true,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "trackVoteV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "proposal",
            isMut: false,
            isSigner: false,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "marker",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "marker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "ProposalV0",
                  path: "proposal",
                },
              ],
            },
          },
          {
            name: "dao",
            isMut: true,
            isSigner: false,
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "delegatedPosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "delegated_position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position",
                },
              ],
            },
            relations: ["sub_dao"],
          },
          {
            name: "daoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "vsrProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
    ],
    accounts: [
      {
        name: "DaoV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "hntMint",
              type: "publicKey",
            },
            {
              name: "dcMint",
              type: "publicKey",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "registrar",
              type: "publicKey",
            },
            {
              name: "hstPool",
              type: "publicKey",
            },
            {
              name: "netEmissionsCap",
              type: "u64",
            },
            {
              name: "numSubDaos",
              type: "u32",
            },
            {
              name: "emissionSchedule",
              type: {
                vec: {
                  defined: "EmissionScheduleItem",
                },
              },
            },
            {
              name: "hstEmissionSchedule",
              type: {
                vec: {
                  defined: "PercentItem",
                },
              },
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "rewardsEscrow",
              type: "publicKey",
            },
            {
              name: "delegatorPool",
              type: "publicKey",
            },
            {
              name: "delegatorRewardsPercent",
              type: "u64",
            },
            {
              name: "proposalNamespace",
              type: "publicKey",
            },
            {
              name: "recentProposals",
              type: {
                array: [
                  {
                    defined: "RecentProposal",
                  },
                  4,
                ],
              },
            },
          ],
        },
      },
      {
        name: "DaoEpochInfoV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "doneCalculatingScores",
              type: "bool",
            },
            {
              name: "epoch",
              type: "u64",
            },
            {
              name: "dao",
              type: "publicKey",
            },
            {
              name: "totalRewards",
              type: "u64",
            },
            {
              name: "currentHntSupply",
              type: "u64",
            },
            {
              name: "totalUtilityScore",
              docs: ["Precise number with 12 decimals"],
              type: "u128",
            },
            {
              name: "numUtilityScoresCalculated",
              type: "u32",
            },
            {
              name: "numRewardsIssued",
              type: "u32",
            },
            {
              name: "doneIssuingRewards",
              type: "bool",
            },
            {
              name: "doneIssuingHstPool",
              type: "bool",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "recentProposals",
              type: {
                array: [
                  {
                    defined: "RecentProposal",
                  },
                  4,
                ],
              },
            },
            {
              name: "delegationRewardsIssued",
              type: "u64",
            },
            {
              name: "vehntAtEpochStart",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "DelegatedPositionV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "mint",
              type: "publicKey",
            },
            {
              name: "position",
              type: "publicKey",
            },
            {
              name: "hntAmount",
              type: "u64",
            },
            {
              name: "subDao",
              type: "publicKey",
            },
            {
              name: "lastClaimedEpoch",
              type: "u64",
            },
            {
              name: "startTs",
              type: "i64",
            },
            {
              name: "purged",
              type: "bool",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "claimedEpochsBitmap",
              type: "u128",
            },
            {
              name: "expirationTs",
              type: "i64",
            },
            {
              name: "recentProposals",
              type: {
                vec: {
                  defined: "RecentProposal",
                },
              },
            },
          ],
        },
      },
      {
        name: "SubDaoEpochInfoV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "epoch",
              type: "u64",
            },
            {
              name: "subDao",
              type: "publicKey",
            },
            {
              name: "dcBurned",
              type: "u64",
            },
            {
              name: "vehntAtEpochStart",
              type: "u64",
            },
            {
              name: "vehntInClosingPositions",
              docs: [
                "The vehnt amount associated with positions that are closing this epoch. This is the amount that will be subtracted from the subdao",
                "total vehnt after the epoch passes. Typically these positions close somewhere between the epoch start and end time, so we cannot rely",
                "on fall rate calculations alone without knowing the exact end date of each position. Instead, just keep track of what needs to be",
                "removed.",
              ],
              type: "u128",
            },
            {
              name: "fallRatesFromClosingPositions",
              docs: [
                "The vehnt amount that is decaying per second, with 12 decimals of extra precision. Associated with positions that are closing this epoch,",
                "which means they must be subtracted from the total fall rate on the subdao after this epoch passes",
              ],
              type: "u128",
            },
            {
              name: "delegationRewardsIssued",
              docs: [
                "The number of delegation rewards issued this epoch, so that delegators can claim their share of the rewards",
              ],
              type: "u64",
            },
            {
              name: "utilityScore",
              docs: ["Precise number with 12 decimals"],
              type: {
                option: "u128",
              },
            },
            {
              name: "rewardsIssuedAt",
              docs: [
                "The program only needs to know whether or not rewards were issued, however having a history of when they were issued could prove",
                "useful in the future, or at least for debugging purposes",
              ],
              type: {
                option: "i64",
              },
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "initialized",
              type: "bool",
            },
            {
              name: "dcOnboardingFeesPaid",
              type: "u64",
            },
            {
              name: "hntRewardsIssued",
              docs: [
                "The number of hnt rewards issued to the reward escrow this epoch",
              ],
              type: "u64",
            },
          ],
        },
      },
      {
        name: "SubDaoV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dao",
              type: "publicKey",
            },
            {
              name: "dntMint",
              type: "publicKey",
            },
            {
              name: "treasury",
              type: "publicKey",
            },
            {
              name: "rewardsEscrow",
              type: "publicKey",
            },
            {
              name: "delegatorPool",
              docs: [
                "DEPRECATED: use dao.delegator_pool instead. But some people still need to claim old DNT rewards",
              ],
              type: "publicKey",
            },
            {
              name: "vehntDelegated",
              type: "u128",
            },
            {
              name: "vehntLastCalculatedTs",
              type: "i64",
            },
            {
              name: "vehntFallRate",
              type: "u128",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "deprecatedActiveDeviceAggregator",
              type: "publicKey",
            },
            {
              name: "dcBurnAuthority",
              type: "publicKey",
            },
            {
              name: "onboardingDcFee",
              type: "u64",
            },
            {
              name: "emissionSchedule",
              type: {
                vec: {
                  defined: "EmissionScheduleItem",
                },
              },
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "registrar",
              type: "publicKey",
            },
            {
              name: "deprecatedDelegatorRewardsPercent",
              type: "u64",
            },
            {
              name: "onboardingDataOnlyDcFee",
              type: "u64",
            },
            {
              name: "dcOnboardingFeesPaid",
              type: "u64",
            },
            {
              name: "activeDeviceAuthority",
              type: "publicKey",
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "WindowedCircuitBreakerConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "windowSizeSeconds",
              type: "u64",
            },
            {
              name: "thresholdType",
              type: {
                defined: "ThresholdType",
              },
            },
            {
              name: "threshold",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "AdminSetDcOnboardingFeesPaidEpochInfoArgs",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dcOnboardingFeesPaid",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "AdminSetDcOnboardingFeesPaidArgs",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dcOnboardingFeesPaid",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "CalculateUtilityScoreArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "epoch",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "ClaimRewardsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "epoch",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "ResetLockupArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "kind",
              type: {
                defined: "LockupKind",
              },
            },
            {
              name: "periods",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "TransferArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "InitializeDaoArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "emissionSchedule",
              type: {
                vec: {
                  defined: "EmissionScheduleItem",
                },
              },
            },
            {
              name: "hstEmissionSchedule",
              type: {
                vec: {
                  defined: "PercentItem",
                },
              },
            },
            {
              name: "netEmissionsCap",
              type: "u64",
            },
            {
              name: "registrar",
              type: "publicKey",
            },
            {
              name: "proposalNamespace",
              type: "publicKey",
            },
            {
              name: "delegatorRewardsPercent",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "InitializeSubDaoArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "emissionSchedule",
              type: {
                vec: {
                  defined: "EmissionScheduleItem",
                },
              },
            },
            {
              name: "treasuryCurve",
              type: {
                defined: "Curve",
              },
            },
            {
              name: "onboardingDcFee",
              type: "u64",
            },
            {
              name: "dcBurnAuthority",
              docs: ["Authority to burn delegated data credits"],
              type: "publicKey",
            },
            {
              name: "registrar",
              type: "publicKey",
            },
            {
              name: "onboardingDataOnlyDcFee",
              type: "u64",
            },
            {
              name: "activeDeviceAuthority",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "IssueRewardsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "epoch",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "TempUpdateSubDaoEpochInfoArgs",
        type: {
          kind: "struct",
          fields: [
            {
              name: "vehntInClosingPositions",
              type: {
                option: "u128",
              },
            },
            {
              name: "fallRatesFromClosingPositions",
              type: {
                option: "u128",
              },
            },
            {
              name: "epoch",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "TrackDcBurnArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dcBurned",
              type: "u64",
            },
            {
              name: "bump",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "TrackDcOnboardingFeesArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
            {
              name: "add",
              type: "bool",
            },
            {
              name: "symbol",
              type: "string",
            },
          ],
        },
      },
      {
        name: "UpdateDaoArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "emissionSchedule",
              type: {
                option: {
                  vec: {
                    defined: "EmissionScheduleItem",
                  },
                },
              },
            },
            {
              name: "hstEmissionSchedule",
              type: {
                option: {
                  vec: {
                    defined: "PercentItem",
                  },
                },
              },
            },
            {
              name: "hstPool",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "netEmissionsCap",
              type: {
                option: "u64",
              },
            },
            {
              name: "proposalNamespace",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "delegatorRewardsPercent",
              type: {
                option: "u64",
              },
            },
            {
              name: "rewardsEscrow",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
      {
        name: "UpdateSubDaoArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "emissionSchedule",
              type: {
                option: {
                  vec: {
                    defined: "EmissionScheduleItem",
                  },
                },
              },
            },
            {
              name: "onboardingDcFee",
              type: {
                option: "u64",
              },
            },
            {
              name: "dcBurnAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "registrar",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "onboardingDataOnlyDcFee",
              type: {
                option: "u64",
              },
            },
            {
              name: "activeDeviceAuthority",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
      {
        name: "UpdateSubDaoVeHntArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "vehntDelegated",
              type: {
                option: "u128",
              },
            },
            {
              name: "vehntLastCalculatedTs",
              type: {
                option: "i64",
              },
            },
            {
              name: "vehntFallRate",
              type: {
                option: "u128",
              },
            },
          ],
        },
      },
      {
        name: "EmissionScheduleItem",
        type: {
          kind: "struct",
          fields: [
            {
              name: "startUnixTime",
              type: "i64",
            },
            {
              name: "emissionsPerEpoch",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "PercentItem",
        type: {
          kind: "struct",
          fields: [
            {
              name: "startUnixTime",
              type: "i64",
            },
            {
              name: "percent",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "RecentProposal",
        type: {
          kind: "struct",
          fields: [
            {
              name: "proposal",
              type: "publicKey",
            },
            {
              name: "ts",
              type: "i64",
            },
          ],
        },
      },
      {
        name: "ThresholdType",
        type: {
          kind: "enum",
          variants: [
            {
              name: "Percent",
            },
            {
              name: "Absolute",
            },
          ],
        },
      },
      {
        name: "LockupKind",
        type: {
          kind: "enum",
          variants: [
            {
              name: "None",
            },
            {
              name: "Cliff",
            },
            {
              name: "Constant",
            },
          ],
        },
      },
      {
        name: "Curve",
        type: {
          kind: "enum",
          variants: [
            {
              name: "ExponentialCurveV0",
              fields: [
                {
                  name: "k",
                  type: "u128",
                },
              ],
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "InvalidDataIncrease",
        msg: "The realloc increase was too large",
      },
      {
        code: 6001,
        name: "ArithmeticError",
        msg: "Error in arithmetic",
      },
      {
        code: 6002,
        name: "UtilityScoreAlreadyCalculated",
        msg: "Utility score was already calculated for this sub dao",
      },
      {
        code: 6003,
        name: "EpochNotOver",
        msg: "Cannot calculate rewards until the epoch is over",
      },
      {
        code: 6004,
        name: "MissingUtilityScores",
        msg: "All utility scores must be calculated before rewards can be issued",
      },
      {
        code: 6005,
        name: "NoUtilityScore",
        msg: "The subdao does not have a utility score",
      },
      {
        code: 6006,
        name: "NotEnoughVeHnt",
        msg: "Not enough veHNT",
      },
      {
        code: 6007,
        name: "LockupNotExpired",
        msg: "Lockup hasn't expired yet",
      },
      {
        code: 6008,
        name: "PositionAlreadyPurged",
        msg: "This staking position has already been purged",
      },
      {
        code: 6009,
        name: "RefreshNotNeeded",
        msg: "This position is healthy, refresh not needed",
      },
      {
        code: 6010,
        name: "FailedVotingPowerCalculation",
        msg: "Failed to calculate the voting power",
      },
      {
        code: 6011,
        name: "InvalidClaimEpoch",
        msg: "Rewards need to be claimed in the correct epoch order",
      },
      {
        code: 6012,
        name: "EpochTooEarly",
        msg: "Epochs start after the earliest emission schedule",
      },
      {
        code: 6013,
        name: "MustCalculateVehntLinearly",
        msg: "Must calculate vehnt linearly. Please ensure the previous epoch has been completed",
      },
      {
        code: 6014,
        name: "PositionChangeWhileDelegated",
        msg: "Cannot change a position while it is delegated",
      },
      {
        code: 6015,
        name: "EpochNotClosed",
        msg: "This epoch was not closed, cannot claim rewards.",
      },
      {
        code: 6016,
        name: "NoDelegateEndingPosition",
        msg: "Cannot delegate on a position ending this epoch",
      },
      {
        code: 6017,
        name: "InvalidMarker",
        msg: "Invalid vote marker",
      },
    ],
    metadata: {
      address: "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR",
    },
  },
  credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT: {
    version: "0.2.2",
    name: "data_credits",
    instructions: [
      {
        name: "initializeDataCreditsV0",
        accounts: [
          {
            name: "dataCredits",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
          },
          {
            name: "hntPriceOracle",
            isMut: false,
            isSigner: false,
          },
          {
            name: "hntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mintAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "freezeAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "accountPayer",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_payer",
                },
              ],
            },
          },
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeDataCreditsArgsV0",
            },
          },
        ],
      },
      {
        name: "mintDataCreditsV0",
        accounts: [
          {
            name: "dataCredits",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
            relations: ["hnt_mint", "dc_mint", "hnt_price_oracle"],
          },
          {
            name: "hntPriceOracle",
            isMut: false,
            isSigner: false,
          },
          {
            name: "burner",
            isMut: true,
            isSigner: false,
            relations: ["owner"],
          },
          {
            name: "recipientTokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "owner",
            isMut: true,
            isSigner: true,
          },
          {
            name: "hntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "MintDataCreditsArgsV0",
            },
          },
        ],
      },
      {
        name: "issueDataCreditsV0",
        accounts: [
          {
            name: "dataCredits",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
            relations: ["dc_mint"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "to",
            isMut: false,
            isSigner: false,
          },
          {
            name: "from",
            isMut: true,
            isSigner: true,
          },
          {
            name: "fromAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "toAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "IssueDataCreditsArgsV0",
            },
          },
        ],
      },
      {
        name: "genesisIssueDelegatedDataCreditsV0",
        accounts: [
          {
            name: "delegatedDataCredits",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dataCredits",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
            relations: ["dc_mint"],
          },
          {
            name: "lazySigner",
            isMut: true,
            isSigner: true,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "lazy_signer",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "nJWGUMOK",
                },
              ],
            },
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "escrowAccount",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "escrow_dc_account",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DelegatedDataCreditsV0",
                  path: "delegated_data_credits",
                },
              ],
            },
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "GenesisIssueDelegatedDataCreditsArgsV0",
            },
          },
        ],
      },
      {
        name: "burnDelegatedDataCreditsV0",
        accounts: [
          {
            name: "subDaoEpochInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao", "dc_burn_authority"],
          },
          {
            name: "dcBurnAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint", "registrar"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "accountPayer",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_payer",
                },
              ],
            },
          },
          {
            name: "dataCredits",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
            relations: ["dc_mint"],
          },
          {
            name: "delegatedDataCredits",
            isMut: false,
            isSigner: false,
            relations: ["escrow_account", "sub_dao", "data_credits"],
          },
          {
            name: "escrowAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumSubDaosProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "BurnDelegatedDataCreditsArgsV0",
            },
          },
        ],
      },
      {
        name: "burnWithoutTrackingV0",
        accounts: [
          {
            name: "burnAccounts",
            accounts: [
              {
                name: "dataCredits",
                isMut: false,
                isSigner: false,
                pda: {
                  seeds: [
                    {
                      kind: "const",
                      type: "string",
                      value: "dc",
                    },
                    {
                      kind: "account",
                      type: "publicKey",
                      account: "Mint",
                      path: "dc_mint",
                    },
                  ],
                },
                relations: ["dc_mint"],
              },
              {
                name: "burner",
                isMut: true,
                isSigner: false,
              },
              {
                name: "owner",
                isMut: true,
                isSigner: true,
              },
              {
                name: "dcMint",
                isMut: true,
                isSigner: false,
              },
              {
                name: "associatedTokenProgram",
                isMut: false,
                isSigner: false,
              },
              {
                name: "tokenProgram",
                isMut: false,
                isSigner: false,
              },
              {
                name: "systemProgram",
                isMut: false,
                isSigner: false,
              },
            ],
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "BurnWithoutTrackingArgsV0",
            },
          },
        ],
      },
      {
        name: "delegateDataCreditsV0",
        accounts: [
          {
            name: "delegatedDataCredits",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dataCredits",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
            relations: ["dc_mint"],
          },
          {
            name: "dcMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "owner",
            isMut: false,
            isSigner: true,
          },
          {
            name: "fromAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "escrowAccount",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "escrow_dc_account",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DelegatedDataCreditsV0",
                  path: "delegated_data_credits",
                },
              ],
            },
          },
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "DelegateDataCreditsArgsV0",
            },
          },
        ],
      },
      {
        name: "updateDataCreditsV0",
        accounts: [
          {
            name: "dataCredits",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
            relations: ["authority"],
          },
          {
            name: "dcMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateDataCreditsArgsV0",
            },
          },
        ],
      },
      {
        name: "changeDelegatedSubDaoV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "delegatedDataCredits",
            isMut: false,
            isSigner: false,
          },
          {
            name: "destinationDelegatedDataCredits",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dataCredits",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
            },
            relations: ["dc_mint"],
          },
          {
            name: "dcMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint", "authority"],
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "destinationSubDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "escrowAccount",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "escrow_dc_account",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DelegatedDataCreditsV0",
                  path: "delegated_data_credits",
                },
              ],
            },
          },
          {
            name: "destinationEscrowAccount",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "escrow_dc_account",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DelegatedDataCreditsV0",
                  path: "destination_delegated_data_credits",
                },
              ],
            },
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ChangeDelegatedSubDaoArgsV0",
            },
          },
        ],
      },
    ],
    accounts: [
      {
        name: "dataCreditsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dcMint",
              type: "publicKey",
            },
            {
              name: "hntMint",
              type: "publicKey",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "hntPriceOracle",
              type: "publicKey",
            },
            {
              name: "dataCreditsBump",
              type: "u8",
            },
            {
              name: "accountPayer",
              type: "publicKey",
            },
            {
              name: "accountPayerBump",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "delegatedDataCreditsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dataCredits",
              type: "publicKey",
            },
            {
              name: "subDao",
              type: "publicKey",
            },
            {
              name: "escrowAccount",
              type: "publicKey",
            },
            {
              name: "routerKey",
              type: "string",
            },
            {
              name: "bump",
              type: "u8",
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "WindowedCircuitBreakerConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "windowSizeSeconds",
              type: "u64",
            },
            {
              name: "thresholdType",
              type: {
                defined: "ThresholdType",
              },
            },
            {
              name: "threshold",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "BurnDelegatedDataCreditsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "BurnWithoutTrackingArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "ChangeDelegatedSubDaoArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
            {
              name: "routerKey",
              type: "string",
            },
          ],
        },
      },
      {
        name: "DelegateDataCreditsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
            {
              name: "routerKey",
              type: "string",
            },
          ],
        },
      },
      {
        name: "GenesisIssueDelegatedDataCreditsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
            {
              name: "routerKey",
              type: "string",
            },
          ],
        },
      },
      {
        name: "InitializeDataCreditsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "config",
              type: {
                defined: "WindowedCircuitBreakerConfigV0",
              },
            },
          ],
        },
      },
      {
        name: "IssueDataCreditsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "MintDataCreditsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "hntAmount",
              type: {
                option: "u64",
              },
            },
            {
              name: "dcAmount",
              type: {
                option: "u64",
              },
            },
          ],
        },
      },
      {
        name: "UpdateDataCreditsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "newAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "hntPriceOracle",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
      {
        name: "ThresholdType",
        type: {
          kind: "enum",
          variants: [
            {
              name: "Percent",
            },
            {
              name: "Absolute",
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "BumpNotAvailable",
        msg: "Bump couldn't be found",
      },
      {
        code: 6001,
        name: "PythError",
        msg: "Error loading Pyth data",
      },
      {
        code: 6002,
        name: "PythPriceNotFound",
        msg: "Pyth price is not available",
      },
      {
        code: 6003,
        name: "PythPriceFeedStale",
        msg: "Pyth price is stale",
      },
      {
        code: 6004,
        name: "ArithmeticError",
        msg: "Arithmetic error",
      },
      {
        code: 6005,
        name: "InvalidArgs",
        msg: "Invalid arguments",
      },
      {
        code: 6006,
        name: "NoGenesis",
        msg: "Genesis endpoints are currently disabled",
      },
    ],
  },
  hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8: {
    version: "0.2.11",
    name: "helium_entity_manager",
    instructions: [
      {
        name: "initializeRewardableEntityConfigV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "rewardableEntityConfig",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "rewardable_entity_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "InitializeRewardableEntityConfigArgsV0",
                  },
                  path: "args.symbol",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeRewardableEntityConfigArgsV0",
            },
          },
        ],
      },
      {
        name: "approveMakerV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["authority", "sub_dao"],
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dnt_mint"],
          },
          {
            name: "dntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "escrow",
            isMut: true,
            isSigner: false,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "maker",
            isMut: false,
            isSigner: false,
          },
          {
            name: "makerApproval",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "maker_approval",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "RewardableEntityConfigV0",
                  path: "rewardable_entity_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "MakerV0",
                  path: "maker",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "revokeMakerV0",
        accounts: [
          {
            name: "refund",
            isMut: true,
            isSigner: true,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "maker",
            isMut: false,
            isSigner: false,
          },
          {
            name: "makerApproval",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "maker_approval",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "RewardableEntityConfigV0",
                  path: "rewardable_entity_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "MakerV0",
                  path: "maker",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "approveProgramV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "programApproval",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "program_approval",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "ApproveProgramArgsV0",
                  },
                  path: "args.program_id",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ApproveProgramArgsV0",
            },
          },
        ],
      },
      {
        name: "revokeProgramV0",
        accounts: [
          {
            name: "refund",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "programApproval",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "program_approval",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "RevokeProgramArgsV0",
                  },
                  path: "args.program_id",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "RevokeProgramArgsV0",
            },
          },
        ],
      },
      {
        name: "initializeMakerV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "maker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "maker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "InitializeMakerArgsV0",
                  },
                  path: "args.name",
                },
              ],
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collection",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "MakerV0",
                  path: "maker",
                },
              ],
            },
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeMakerArgsV0",
            },
          },
        ],
      },
      {
        name: "issueEntityV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "eccVerifier",
            isMut: false,
            isSigner: true,
          },
          {
            name: "issuingAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "maker",
            isMut: true,
            isSigner: false,
            relations: [
              "issuing_authority",
              "collection",
              "merkle_tree",
              "dao",
            ],
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "bubblegumSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection_cpi",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "IssueEntityArgsV0",
            },
          },
        ],
      },
      {
        name: "issueProgramEntityV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "programApprover",
            isMut: false,
            isSigner: true,
          },
          {
            name: "programApproval",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "collectionAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "bubblegumSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection_cpi",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "IssueProgramEntityArgsV0",
            },
          },
        ],
      },
      {
        name: "issueNotEmittedEntityV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "recipient",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "not_emitted",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "no_emit_program",
              },
            },
          },
          {
            name: "recipientAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "instructions",
            isMut: false,
            isSigner: false,
          },
          {
            name: "noEmitProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "issueIotOperationsFundV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "recipientAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "onboardIotHotspotV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dcFeePayer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "issuingAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "iotInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hotspotOwner",
            isMut: true,
            isSigner: true,
          },
          {
            name: "merkleTree",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dcBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "makerApproval",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "maker_approval",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "RewardableEntityConfigV0",
                  path: "rewardable_entity_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "MakerV0",
                  path: "maker",
                },
              ],
            },
            relations: ["maker", "rewardable_entity_config"],
          },
          {
            name: "maker",
            isMut: false,
            isSigner: false,
            relations: ["merkle_tree", "issuing_authority", "dao"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dc",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "data_credits_program",
              },
            },
            relations: ["dc_mint"],
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dataCreditsProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumSubDaosProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "OnboardIotHotspotArgsV0",
            },
          },
        ],
      },
      {
        name: "onboardMobileHotspotV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dcFeePayer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "issuingAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "mobileInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hotspotOwner",
            isMut: true,
            isSigner: true,
          },
          {
            name: "merkleTree",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dcBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "makerApproval",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "maker_approval",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "RewardableEntityConfigV0",
                  path: "rewardable_entity_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "MakerV0",
                  path: "maker",
                },
              ],
            },
            relations: ["maker", "rewardable_entity_config"],
          },
          {
            name: "maker",
            isMut: false,
            isSigner: false,
            relations: ["merkle_tree", "issuing_authority", "dao"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao", "dnt_mint"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntPrice",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dc",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "data_credits_program",
              },
            },
            relations: ["dc_mint"],
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dataCreditsProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumSubDaosProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "OnboardMobileHotspotArgsV0",
            },
          },
        ],
      },
      {
        name: "updateRewardableEntityConfigV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "rewardableEntityConfig",
            isMut: true,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateRewardableEntityConfigArgsV0",
            },
          },
        ],
      },
      {
        name: "updateMakerV0",
        accounts: [
          {
            name: "maker",
            isMut: true,
            isSigner: false,
            relations: ["update_authority"],
          },
          {
            name: "updateAuthority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateMakerArgsV0",
            },
          },
        ],
      },
      {
        name: "setMakerTreeV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "updateAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "maker",
            isMut: true,
            isSigner: false,
            relations: ["update_authority"],
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "SetMakerTreeArgsV0",
            },
          },
        ],
      },
      {
        name: "updateMakerTreeV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "maker",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  account: "MakerV0",
                  path: "maker.merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "newTreeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "new_merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "newMerkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateMakerTreeArgsV0",
            },
          },
        ],
      },
      {
        name: "updateIotInfoV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dcFeePayer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "iotInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hotspotOwner",
            isMut: true,
            isSigner: true,
          },
          {
            name: "merkleTree",
            isMut: false,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "dcBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dc",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "data_credits_program",
              },
            },
            relations: ["dc_mint"],
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dataCreditsProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateIotInfoArgsV0",
            },
          },
        ],
      },
      {
        name: "updateMobileInfoV0",
        accounts: [
          {
            name: "payer",
            isMut: false,
            isSigner: true,
          },
          {
            name: "dcFeePayer",
            isMut: false,
            isSigner: true,
          },
          {
            name: "mobileInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hotspotOwner",
            isMut: true,
            isSigner: true,
          },
          {
            name: "merkleTree",
            isMut: false,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "dcBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dc",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "data_credits_program",
              },
            },
            relations: ["dc_mint"],
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dataCreditsProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateMobileInfoArgsV0",
            },
          },
        ],
      },
      {
        name: "initializeDataOnlyV0",
        accounts: [
          {
            name: "authority",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dataOnlyConfig",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "data_only_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "collection",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DataOnlyConfigV0",
                  path: "data_only_config",
                },
              ],
            },
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeDataOnlyArgsV0",
            },
          },
        ],
      },
      {
        name: "issueDataOnlyEntityV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "eccVerifier",
            isMut: false,
            isSigner: true,
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "dataOnlyConfig",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "data_only_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
            relations: ["collection", "merkle_tree", "dao"],
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dataOnlyEscrow",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "data_only_escrow",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DataOnlyConfigV0",
                  path: "data_only_config",
                },
              ],
            },
          },
          {
            name: "bubblegumSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection_cpi",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "IssueDataOnlyEntityArgsV0",
            },
          },
        ],
      },
      {
        name: "onboardDataOnlyIotHotspotV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dcFeePayer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "iotInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hotspotOwner",
            isMut: true,
            isSigner: true,
          },
          {
            name: "merkleTree",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dcBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "dataOnlyConfig",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "data_only_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
            relations: ["merkle_tree", "dao"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dc",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "data_credits_program",
              },
            },
            relations: ["dc_mint"],
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dataCreditsProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumSubDaosProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "OnboardDataOnlyIotHotspotArgsV0",
            },
          },
        ],
      },
      {
        name: "updateDataOnlyTreeV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dataOnlyConfig",
            isMut: true,
            isSigner: false,
          },
          {
            name: "oldTreeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DataOnlyConfigV0",
                  path: "data_only_config.merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "newTreeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "new_merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "dataOnlyEscrow",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "data_only_escrow",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DataOnlyConfigV0",
                  path: "data_only_config",
                },
              ],
            },
          },
          {
            name: "newMerkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "setEntityActiveV0",
        accounts: [
          {
            name: "activeDeviceAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["active_device_authority"],
          },
          {
            name: "info",
            isMut: true,
            isSigner: false,
          },
          {
            name: "heliumSubDaosProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "SetEntityActiveArgsV0",
            },
          },
        ],
      },
      {
        name: "tempPayMobileOnboardingFeeV0",
        accounts: [
          {
            name: "dcFeePayer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dcBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dc",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "data_credits_program",
              },
            },
            relations: ["dc_mint"],
          },
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "mobileInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dataCreditsProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumSubDaosProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "tempStandardizeEntity",
        accounts: [
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "maker",
            isMut: true,
            isSigner: false,
            isOptional: true,
          },
          {
            name: "dataOnlyConfig",
            isMut: false,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "leafOwner",
            isMut: false,
            isSigner: false,
          },
          {
            name: "payer",
            isMut: false,
            isSigner: true,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "TempStandardizeEntityArgs",
            },
          },
        ],
      },
      {
        name: "onboardDataOnlyMobileHotspotV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "dcFeePayer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "mobileInfo",
            isMut: true,
            isSigner: false,
          },
          {
            name: "hotspotOwner",
            isMut: true,
            isSigner: true,
          },
          {
            name: "merkleTree",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dcBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntBurner",
            isMut: true,
            isSigner: false,
          },
          {
            name: "rewardableEntityConfig",
            isMut: false,
            isSigner: false,
            relations: ["sub_dao"],
          },
          {
            name: "dataOnlyConfig",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "data_only_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
            },
            relations: ["merkle_tree", "dao"],
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
            relations: ["dc_mint"],
          },
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "subDao",
            isMut: true,
            isSigner: false,
            relations: ["dao", "dnt_mint"],
          },
          {
            name: "dcMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "dntPrice",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dc",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "dc",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dc_mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "data_credits_program",
              },
            },
            relations: ["dc_mint"],
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dataCreditsProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumSubDaosProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "OnboardDataOnlyMobileHotspotArgsV0",
            },
          },
        ],
      },
    ],
    accounts: [
      {
        name: "rewardableEntityConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "symbol",
              type: "string",
            },
            {
              name: "subDao",
              type: "publicKey",
            },
            {
              name: "settings",
              type: {
                defined: "ConfigSettingsV0",
              },
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "stakingRequirement",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "makerV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "updateAuthority",
              type: "publicKey",
            },
            {
              name: "issuingAuthority",
              type: "publicKey",
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "collection",
              type: "publicKey",
            },
            {
              name: "merkleTree",
              type: "publicKey",
            },
            {
              name: "collectionBumpSeed",
              type: "u8",
            },
            {
              name: "dao",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "makerApprovalV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "rewardableEntityConfig",
              type: "publicKey",
            },
            {
              name: "maker",
              type: "publicKey",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "dataOnlyConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "collection",
              type: "publicKey",
            },
            {
              name: "merkleTree",
              type: "publicKey",
            },
            {
              name: "collectionBumpSeed",
              type: "u8",
            },
            {
              name: "dao",
              type: "publicKey",
            },
            {
              name: "newTreeDepth",
              type: "u32",
            },
            {
              name: "newTreeBufferSize",
              type: "u32",
            },
            {
              name: "newTreeSpace",
              type: "u64",
            },
            {
              name: "newTreeFeeLamports",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "programApprovalV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dao",
              type: "publicKey",
            },
            {
              name: "programId",
              type: "publicKey",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "keyToAssetV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dao",
              type: "publicKey",
            },
            {
              name: "asset",
              type: "publicKey",
            },
            {
              name: "entityKey",
              type: "bytes",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "keySerialization",
              type: {
                defined: "KeySerialization",
              },
            },
          ],
        },
      },
      {
        name: "iotHotspotInfoV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "asset",
              type: "publicKey",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
            {
              name: "elevation",
              type: {
                option: "i32",
              },
            },
            {
              name: "gain",
              type: {
                option: "i32",
              },
            },
            {
              name: "isFullHotspot",
              type: "bool",
            },
            {
              name: "numLocationAsserts",
              type: "u16",
            },
            {
              name: "isActive",
              type: "bool",
            },
            {
              name: "dcOnboardingFeePaid",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "mobileHotspotInfoV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "asset",
              type: "publicKey",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
            {
              name: "isFullHotspot",
              type: "bool",
            },
            {
              name: "numLocationAsserts",
              type: "u16",
            },
            {
              name: "isActive",
              type: "bool",
            },
            {
              name: "dcOnboardingFeePaid",
              type: "u64",
            },
            {
              name: "deviceType",
              type: {
                defined: "MobileDeviceTypeV0",
              },
            },
            {
              name: "deploymentInfo",
              type: {
                option: {
                  defined: "MobileDeploymentInfoV0",
                },
              },
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "ApproveProgramArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "programId",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "InitializeDataOnlyArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "newTreeDepth",
              type: "u32",
            },
            {
              name: "newTreeBufferSize",
              type: "u32",
            },
            {
              name: "newTreeSpace",
              type: "u64",
            },
            {
              name: "newTreeFeeLamports",
              type: "u64",
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "metadataUrl",
              type: "string",
            },
          ],
        },
      },
      {
        name: "InitializeMakerArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "updateAuthority",
              type: "publicKey",
            },
            {
              name: "issuingAuthority",
              type: "publicKey",
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "metadataUrl",
              type: "string",
            },
          ],
        },
      },
      {
        name: "InitializeRewardableEntityConfigArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "symbol",
              type: "string",
            },
            {
              name: "settings",
              type: {
                defined: "ConfigSettingsV0",
              },
            },
            {
              name: "stakingRequirement",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "IssueDataOnlyEntityArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "entityKey",
              type: "bytes",
            },
          ],
        },
      },
      {
        name: "IssueEntityArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "entityKey",
              type: "bytes",
            },
          ],
        },
      },
      {
        name: "IssueProgramEntityArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "entityKey",
              type: "bytes",
            },
            {
              name: "keySerialization",
              type: {
                defined: "KeySerialization",
              },
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "symbol",
              type: "string",
            },
            {
              name: "approverSeeds",
              type: {
                vec: "bytes",
              },
            },
            {
              name: "metadataUrl",
              type: {
                option: "string",
              },
            },
          ],
        },
      },
      {
        name: "OnboardDataOnlyIotHotspotArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dataHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "creatorHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "index",
              type: "u32",
            },
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
            {
              name: "elevation",
              type: {
                option: "i32",
              },
            },
            {
              name: "gain",
              type: {
                option: "i32",
              },
            },
          ],
        },
      },
      {
        name: "OnboardDataOnlyMobileHotspotArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dataHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "creatorHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "index",
              type: "u32",
            },
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
          ],
        },
      },
      {
        name: "OnboardIotHotspotArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dataHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "creatorHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "index",
              type: "u32",
            },
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
            {
              name: "elevation",
              type: {
                option: "i32",
              },
            },
            {
              name: "gain",
              type: {
                option: "i32",
              },
            },
          ],
        },
      },
      {
        name: "OnboardMobileHotspotArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "dataHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "creatorHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "index",
              type: "u32",
            },
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
            {
              name: "deviceType",
              type: {
                defined: "MobileDeviceTypeV0",
              },
            },
            {
              name: "deploymentInfo",
              type: {
                option: {
                  defined: "MobileDeploymentInfoV0",
                },
              },
            },
          ],
        },
      },
      {
        name: "RevokeProgramArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "programId",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "SetEntityActiveArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "isActive",
              type: "bool",
            },
            {
              name: "entityKey",
              type: "bytes",
            },
          ],
        },
      },
      {
        name: "SetMakerTreeArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "maxDepth",
              type: "u32",
            },
            {
              name: "maxBufferSize",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "MetadataArgs",
        type: {
          kind: "struct",
          fields: [
            {
              name: "name",
              docs: ["The name of the asset"],
              type: "string",
            },
            {
              name: "symbol",
              docs: ["The symbol for the asset"],
              type: "string",
            },
            {
              name: "uri",
              docs: ["URI pointing to JSON representing the asset"],
              type: "string",
            },
            {
              name: "creators",
              type: {
                vec: {
                  defined: "Creator",
                },
              },
            },
          ],
        },
      },
      {
        name: "Creator",
        type: {
          kind: "struct",
          fields: [
            {
              name: "address",
              type: "publicKey",
            },
            {
              name: "verified",
              type: "bool",
            },
            {
              name: "share",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "TempStandardizeEntityArgs",
        type: {
          kind: "struct",
          fields: [
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "index",
              type: "u32",
            },
            {
              name: "currentMetadata",
              type: {
                defined: "MetadataArgs",
              },
            },
          ],
        },
      },
      {
        name: "UpdateIotInfoArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
            {
              name: "elevation",
              type: {
                option: "i32",
              },
            },
            {
              name: "gain",
              type: {
                option: "i32",
              },
            },
            {
              name: "dataHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "creatorHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "index",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "UpdateMakerTreeArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "maxDepth",
              type: "u32",
            },
            {
              name: "maxBufferSize",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "UpdateMakerArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "issuingAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "updateAuthority",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
      {
        name: "UpdateMobileInfoArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "location",
              type: {
                option: "u64",
              },
            },
            {
              name: "dataHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "creatorHash",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "index",
              type: "u32",
            },
            {
              name: "deploymentInfo",
              type: {
                option: {
                  defined: "MobileDeploymentInfoV0",
                },
              },
            },
          ],
        },
      },
      {
        name: "UpdateRewardableEntityConfigArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "newAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "settings",
              type: {
                option: {
                  defined: "ConfigSettingsV0",
                },
              },
            },
            {
              name: "stakingRequirement",
              type: {
                option: "u64",
              },
            },
          ],
        },
      },
      {
        name: "DeviceFeesV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "deviceType",
              type: {
                defined: "MobileDeviceTypeV0",
              },
            },
            {
              name: "dcOnboardingFee",
              type: "u64",
            },
            {
              name: "locationStakingFee",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "DeviceFeesV1",
        type: {
          kind: "struct",
          fields: [
            {
              name: "deviceType",
              type: {
                defined: "MobileDeviceTypeV0",
              },
            },
            {
              name: "dcOnboardingFee",
              type: "u64",
            },
            {
              name: "locationStakingFee",
              type: "u64",
            },
            {
              name: "mobileOnboardingFeeUsd",
              type: "u64",
            },
            {
              name: "reserved",
              type: {
                array: ["u64", 8],
              },
            },
          ],
        },
      },
      {
        name: "RadioInfoV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "radioId",
              type: "string",
            },
            {
              name: "elevation",
              type: "i32",
            },
          ],
        },
      },
      {
        name: "MobileDeviceTypeV0",
        type: {
          kind: "enum",
          variants: [
            {
              name: "Cbrs",
            },
            {
              name: "WifiIndoor",
            },
            {
              name: "WifiOutdoor",
            },
            {
              name: "WifiDataOnly",
            },
          ],
        },
      },
      {
        name: "ConfigSettingsV0",
        type: {
          kind: "enum",
          variants: [
            {
              name: "IotConfig",
              fields: [
                {
                  name: "min_gain",
                  type: "i32",
                },
                {
                  name: "max_gain",
                  type: "i32",
                },
                {
                  name: "full_location_staking_fee",
                  type: "u64",
                },
                {
                  name: "dataonly_location_staking_fee",
                  type: "u64",
                },
              ],
            },
            {
              name: "MobileConfig",
              fields: [
                {
                  name: "full_location_staking_fee",
                  type: "u64",
                },
                {
                  name: "dataonly_location_staking_fee",
                  type: "u64",
                },
              ],
            },
            {
              name: "MobileConfigV1",
              fields: [
                {
                  name: "fees_by_device",
                  type: {
                    vec: {
                      defined: "DeviceFeesV0",
                    },
                  },
                },
              ],
            },
            {
              name: "MobileConfigV2",
              fields: [
                {
                  name: "fees_by_device",
                  type: {
                    vec: {
                      defined: "DeviceFeesV1",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        name: "KeySerialization",
        type: {
          kind: "enum",
          variants: [
            {
              name: "B58",
            },
            {
              name: "UTF8",
            },
          ],
        },
      },
      {
        name: "MobileDeploymentInfoV0",
        type: {
          kind: "enum",
          variants: [
            {
              name: "WifiInfoV0",
              fields: [
                {
                  name: "antenna",
                  type: "u32",
                },
                {
                  name: "elevation",
                  type: "i32",
                },
                {
                  name: "azimuth",
                  type: "u16",
                },
                {
                  name: "mechanical_down_tilt",
                  type: "u16",
                },
                {
                  name: "electrical_down_tilt",
                  type: "u16",
                },
              ],
            },
            {
              name: "CbrsInfoV0",
              fields: [
                {
                  name: "radio_infos",
                  type: {
                    vec: {
                      defined: "RadioInfoV0",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "InvalidEccCompact",
        msg: "Invalid ecc compcat",
      },
      {
        code: 6001,
        name: "InvalidStringLength",
        msg: "Invalid string length, your string was likely too long",
      },
      {
        code: 6002,
        name: "StringNotAlphanumeric",
        msg: "The string was not alphanumeric",
      },
      {
        code: 6003,
        name: "InvalidMetadataProgram",
        msg: "Metadata Program Mismatch",
      },
      {
        code: 6004,
        name: "InvalidDataIncrease",
        msg: "The realloc increase was too large",
      },
      {
        code: 6005,
        name: "NoGenesis",
        msg: "Genesis endpoints are currently disabled",
      },
      {
        code: 6006,
        name: "TreeNotFull",
        msg: "The tree can only be replaced when it is close to full",
      },
      {
        code: 6007,
        name: "InvalidTreeSpace",
        msg: "The provided tree is an invalid size",
      },
      {
        code: 6008,
        name: "InvalidSeeds",
        msg: "Invalid seeds provided",
      },
      {
        code: 6009,
        name: "InvalidSettings",
        msg: "Invalid settings provided",
      },
      {
        code: 6010,
        name: "InvalidDcFee",
        msg: "Invalid DC fee",
      },
      {
        code: 6011,
        name: "OnboardingFeeAlreadySet",
        msg: "Onboarding fee has already been set for this account",
      },
      {
        code: 6012,
        name: "InvalidAccountAddress",
        msg: "Account doesn't matched expected address",
      },
      {
        code: 6013,
        name: "InvalidSymbol",
        msg: "Invalid symbol, must be 'IOT' or 'MOBILE'",
      },
      {
        code: 6014,
        name: "InvalidDeviceType",
        msg: "Mobile device type not found",
      },
      {
        code: 6015,
        name: "PythError",
        msg: "Error loading Pyth data",
      },
      {
        code: 6016,
        name: "PythPriceNotFound",
        msg: "Pyth price is not available",
      },
      {
        code: 6017,
        name: "PythPriceFeedStale",
        msg: "Pyth price is stale",
      },
      {
        code: 6018,
        name: "ArithmeticError",
        msg: "Arithmetic error",
      },
    ],
  },
  circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g: {
    version: "0.1.0",
    name: "circuit_breaker",
    instructions: [
      {
        name: "initializeMintWindowedBreakerV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mintAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeMintWindowedBreakerArgsV0",
            },
          },
        ],
      },
      {
        name: "initializeAccountWindowedBreakerV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "token_account",
                },
              ],
            },
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
            relations: ["owner"],
          },
          {
            name: "owner",
            isMut: false,
            isSigner: true,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeAccountWindowedBreakerArgsV0",
            },
          },
        ],
      },
      {
        name: "mintV0",
        accounts: [
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "to",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mintAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "mint_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["mint_authority", "mint"],
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "MintArgsV0",
            },
          },
        ],
      },
      {
        name: "transferV0",
        accounts: [
          {
            name: "from",
            isMut: true,
            isSigner: false,
          },
          {
            name: "to",
            isMut: true,
            isSigner: false,
          },
          {
            name: "owner",
            isMut: false,
            isSigner: true,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "from",
                },
              ],
            },
            relations: ["owner"],
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "TransferArgsV0",
            },
          },
        ],
      },
      {
        name: "updateAccountWindowedBreakerV0",
        accounts: [
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateAccountWindowedBreakerArgsV0",
            },
          },
        ],
      },
      {
        name: "updateMintWindowedBreakerV0",
        accounts: [
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            relations: ["authority"],
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateMintWindowedBreakerArgsV0",
            },
          },
        ],
      },
    ],
    accounts: [
      {
        name: "mintWindowedCircuitBreakerV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "mint",
              type: "publicKey",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "mintAuthority",
              type: "publicKey",
            },
            {
              name: "config",
              type: {
                defined: "WindowedCircuitBreakerConfigV0",
              },
            },
            {
              name: "lastWindow",
              type: {
                defined: "WindowV0",
              },
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "accountWindowedCircuitBreakerV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "tokenAccount",
              type: "publicKey",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "owner",
              type: "publicKey",
            },
            {
              name: "config",
              type: {
                defined: "WindowedCircuitBreakerConfigV0",
              },
            },
            {
              name: "lastWindow",
              type: {
                defined: "WindowV0",
              },
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "InitializeAccountWindowedBreakerArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "owner",
              type: "publicKey",
            },
            {
              name: "config",
              type: {
                defined: "WindowedCircuitBreakerConfigV0",
              },
            },
          ],
        },
      },
      {
        name: "InitializeMintWindowedBreakerArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "mintAuthority",
              type: "publicKey",
            },
            {
              name: "config",
              type: {
                defined: "WindowedCircuitBreakerConfigV0",
              },
            },
          ],
        },
      },
      {
        name: "MintArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "TransferArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "UpdateAccountWindowedBreakerArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "newAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "config",
              type: {
                option: {
                  defined: "WindowedCircuitBreakerConfigV0",
                },
              },
            },
          ],
        },
      },
      {
        name: "UpdateMintWindowedBreakerArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "newAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "config",
              type: {
                option: {
                  defined: "WindowedCircuitBreakerConfigV0",
                },
              },
            },
          ],
        },
      },
      {
        name: "WindowV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "lastAggregatedValue",
              type: "u64",
            },
            {
              name: "lastUnixTimestamp",
              type: "i64",
            },
          ],
        },
      },
      {
        name: "WindowedCircuitBreakerConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "windowSizeSeconds",
              type: "u64",
            },
            {
              name: "thresholdType",
              type: {
                defined: "ThresholdType",
              },
            },
            {
              name: "threshold",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "ThresholdType",
        type: {
          kind: "enum",
          variants: [
            {
              name: "Percent",
            },
            {
              name: "Absolute",
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "CircuitBreakerTriggered",
        msg: "The circuit breaker was triggered",
      },
      {
        code: 6001,
        name: "ArithmeticError",
        msg: "Error in arithmetic",
      },
      {
        code: 6002,
        name: "InvalidConfig",
        msg: "Invalid config",
      },
    ],
  },
  treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5: {
    version: "0.2.0",
    name: "treasury_management",
    instructions: [
      {
        name: "initializeTreasuryManagementV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "treasuryManagement",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "treasury_management",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "supply_mint",
                },
              ],
            },
          },
          {
            name: "treasuryMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "supplyMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "mintAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "treasury",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "treasury",
            isMut: true,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeTreasuryManagementArgsV0",
            },
          },
        ],
      },
      {
        name: "updateTreasuryManagementV0",
        accounts: [
          {
            name: "treasuryManagement",
            isMut: true,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateTreasuryManagementArgsV0",
            },
          },
        ],
      },
      {
        name: "redeemV0",
        accounts: [
          {
            name: "treasuryManagement",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "treasury_management",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "supply_mint",
                },
              ],
            },
            relations: ["treasury", "supply_mint", "treasury_mint"],
          },
          {
            name: "treasuryMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "supplyMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treasury",
            isMut: true,
            isSigner: false,
          },
          {
            name: "circuitBreaker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "account_windowed_breaker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "TokenAccount",
                  path: "treasury",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "circuit_breaker_program",
              },
            },
          },
          {
            name: "from",
            isMut: true,
            isSigner: false,
            relations: ["owner"],
          },
          {
            name: "to",
            isMut: true,
            isSigner: false,
          },
          {
            name: "owner",
            isMut: false,
            isSigner: true,
          },
          {
            name: "circuitBreakerProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "RedeemArgsV0",
            },
          },
        ],
      },
    ],
    accounts: [
      {
        name: "treasuryManagementV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "treasuryMint",
              type: "publicKey",
            },
            {
              name: "supplyMint",
              type: "publicKey",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "treasury",
              type: "publicKey",
            },
            {
              name: "curve",
              docs: ["The bonding curve to use"],
              type: {
                defined: "Curve",
              },
            },
            {
              name: "freezeUnixTime",
              docs: ["Freeze this curve at this time."],
              type: "i64",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "WindowedCircuitBreakerConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "windowSizeSeconds",
              type: "u64",
            },
            {
              name: "thresholdType",
              type: {
                defined: "ThresholdType",
              },
            },
            {
              name: "threshold",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "InitializeTreasuryManagementArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "curve",
              type: {
                defined: "Curve",
              },
            },
            {
              name: "freezeUnixTime",
              type: "i64",
            },
            {
              name: "windowConfig",
              type: {
                defined: "WindowedCircuitBreakerConfigV0",
              },
            },
          ],
        },
      },
      {
        name: "RedeemArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
            {
              name: "expectedOutputAmount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "UpdateTreasuryManagementArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "curve",
              type: {
                defined: "Curve",
              },
            },
            {
              name: "freezeUnixTime",
              type: "i64",
            },
          ],
        },
      },
      {
        name: "ThresholdType",
        type: {
          kind: "enum",
          variants: [
            {
              name: "Percent",
            },
            {
              name: "Absolute",
            },
          ],
        },
      },
      {
        name: "Curve",
        type: {
          kind: "enum",
          variants: [
            {
              name: "ExponentialCurveV0",
              fields: [
                {
                  name: "k",
                  type: "u128",
                },
              ],
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "Frozen",
        msg: "Treasury management is currently frozen",
      },
      {
        code: 6001,
        name: "ArithmeticError",
        msg: "Error in arithmetic",
      },
    ],
  },
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h": {
    version: "0.2.0",
    name: "lazy_transactions",
    instructions: [
      {
        name: "initializeLazyTransactionsV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "lazyTransactions",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "lazy_transactions",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "InitializeLazyTransactionsArgsV0",
                  },
                  path: "args.name",
                },
              ],
            },
          },
          {
            name: "canopy",
            isMut: true,
            isSigner: false,
          },
          {
            name: "executedTransactions",
            isMut: true,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeLazyTransactionsArgsV0",
            },
          },
        ],
      },
      {
        name: "executeTransactionV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "lazyTransactions",
            isMut: true,
            isSigner: false,
            relations: ["canopy", "executed_transactions"],
          },
          {
            name: "canopy",
            isMut: false,
            isSigner: false,
          },
          {
            name: "lazySigner",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "lazy_signer",
                },
                {
                  kind: "account",
                  type: "string",
                  account: "LazyTransactionsV0",
                  path: "lazy_transactions.name",
                },
              ],
            },
          },
          {
            name: "block",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "block",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "LazyTransactionsV0",
                  path: "lazy_transactions",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "ExecuteTransactionArgsV0",
                  },
                  path: "args.index",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "executedTransactions",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ExecuteTransactionArgsV0",
            },
          },
        ],
      },
      {
        name: "closeMarkerV0",
        accounts: [
          {
            name: "refund",
            isMut: true,
            isSigner: false,
          },
          {
            name: "lazyTransactions",
            isMut: true,
            isSigner: false,
            relations: ["authority", "executed_transactions"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "block",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "block",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "LazyTransactionsV0",
                  path: "lazy_transactions",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "CloseMarkerArgsV0",
                  },
                  path: "args.index",
                },
              ],
            },
          },
          {
            name: "executedTransactions",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "CloseMarkerArgsV0",
            },
          },
        ],
      },
      {
        name: "closeCanopyV0",
        accounts: [
          {
            name: "refund",
            isMut: true,
            isSigner: false,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "lazyTransactions",
            isMut: true,
            isSigner: false,
            relations: ["authority", "canopy"],
          },
          {
            name: "canopy",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "updateLazyTransactionsV0",
        accounts: [
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "lazyTransactions",
            isMut: true,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "canopy",
            isMut: true,
            isSigner: false,
          },
          {
            name: "executedTransactions",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateLazyTransactionsArgsV0",
            },
          },
        ],
      },
      {
        name: "setCanopyV0",
        accounts: [
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "lazyTransactions",
            isMut: true,
            isSigner: false,
            relations: ["authority", "canopy"],
          },
          {
            name: "canopy",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "SetCanopyArgsV0",
            },
          },
        ],
      },
    ],
    accounts: [
      {
        name: "lazyTransactionsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "maxDepth",
              type: "u32",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "canopy",
              type: "publicKey",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "executedTransactions",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "block",
        type: {
          kind: "struct",
          fields: [],
        },
      },
    ],
    types: [
      {
        name: "CloseMarkerArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "index",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "CompiledInstruction",
        type: {
          kind: "struct",
          fields: [
            {
              name: "programIdIndex",
              docs: [
                "Index into the transaction keys array indicating the program account that executes this instruction.",
              ],
              type: "u8",
            },
            {
              name: "accounts",
              docs: [
                "Ordered indices into the transaction keys array indicating which accounts to pass to the program.",
              ],
              type: "bytes",
            },
            {
              name: "data",
              docs: ["The program input data."],
              type: "bytes",
            },
          ],
        },
      },
      {
        name: "ExecuteTransactionArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "instructions",
              type: {
                vec: {
                  defined: "CompiledInstruction",
                },
              },
            },
            {
              name: "signerSeeds",
              docs: [
                "Additional signer seeds. Should include bump",
                'Note that these seeds will be prefixed with "user", lazy_transactions.name',
                "and the bump you pass and account should be consistent with this. But to save space",
                "in the instruction, they should be ommitted here. See tests for examples",
              ],
              type: {
                vec: {
                  vec: "bytes",
                },
              },
            },
            {
              name: "index",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "InitializeLazyTransactionsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "root",
              type: {
                array: ["u8", 32],
              },
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "maxDepth",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "SetCanopyArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "offset",
              type: "u32",
            },
            {
              name: "bytes",
              type: "bytes",
            },
          ],
        },
      },
      {
        name: "UpdateLazyTransactionsArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "root",
              type: {
                option: {
                  array: ["u8", 32],
                },
              },
            },
            {
              name: "authority",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "InvalidData",
        msg: "The data did not match the root verification",
      },
      {
        code: 6001,
        name: "InstructionSerializeFailed",
        msg: "Failed to serialize instruction",
      },
      {
        code: 6002,
        name: "ToCreateSerializeFailed",
        msg: "Failed to serialize ToCreate",
      },
      {
        code: 6003,
        name: "CanopyLengthMismatch",
        msg: "Invalid canopy length",
      },
      {
        code: 6004,
        name: "TransactionAlreadyExecuted",
        msg: "Transaction has already been executed",
      },
    ],
  },
  porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy: {
    version: "0.2.1",
    name: "price_oracle",
    instructions: [
      {
        name: "initializePriceOracleV0",
        accounts: [
          {
            name: "priceOracle",
            isMut: true,
            isSigner: true,
          },
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializePriceOracleArgsV0",
            },
          },
        ],
      },
      {
        name: "updatePriceOracleV0",
        accounts: [
          {
            name: "priceOracle",
            isMut: true,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: true,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdatePriceOracleArgsV0",
            },
          },
        ],
      },
      {
        name: "submitPriceV0",
        accounts: [
          {
            name: "priceOracle",
            isMut: true,
            isSigner: false,
          },
          {
            name: "oracle",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "SubmitPriceArgsV0",
            },
          },
        ],
      },
      {
        name: "updatePriceV0",
        accounts: [
          {
            name: "priceOracle",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [],
      },
    ],
    accounts: [
      {
        name: "priceOracleV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "numOracles",
              type: "u8",
            },
            {
              name: "decimals",
              type: "u8",
            },
            {
              name: "oracles",
              type: {
                vec: {
                  defined: "OracleV0",
                },
              },
            },
            {
              name: "currentPrice",
              type: {
                option: "u64",
              },
            },
            {
              name: "lastCalculatedTimestamp",
              type: {
                option: "i64",
              },
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "InitializePriceOracleArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "oracles",
              type: {
                vec: {
                  defined: "OracleV0",
                },
              },
            },
            {
              name: "decimals",
              type: "u8",
            },
            {
              name: "authority",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "SubmitPriceArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "oracleIndex",
              type: "u8",
            },
            {
              name: "price",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "UpdatePriceOracleArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "oracles",
              type: {
                option: {
                  vec: {
                    defined: "OracleV0",
                  },
                },
              },
            },
            {
              name: "authority",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
      {
        name: "OracleV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "lastSubmittedTimestamp",
              type: {
                option: "i64",
              },
            },
            {
              name: "lastSubmittedPrice",
              type: {
                option: "u64",
              },
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "InvalidDataIncrease",
        msg: "The realloc increase was too large",
      },
      {
        code: 6001,
        name: "UnauthorisedOracle",
        msg: "Not authorised to submit a price",
      },
      {
        code: 6002,
        name: "InvalidPriceUpdate",
        msg: "Unable to update price",
      },
      {
        code: 6003,
        name: "InvalidArgs",
        msg: "Invalid argument",
      },
    ],
  },
  rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF: {
    version: "0.2.1",
    name: "rewards_oracle",
    instructions: [
      {
        name: "setCurrentRewardsWrapperV0",
        accounts: [
          {
            name: "oracle",
            isMut: true,
            isSigner: true,
          },
          {
            name: "lazyDistributor",
            isMut: false,
            isSigner: false,
          },
          {
            name: "recipient",
            isMut: true,
            isSigner: false,
            relations: ["lazy_distributor"],
          },
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
          },
          {
            name: "oracleSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "oracle_signer",
                },
              ],
            },
          },
          {
            name: "lazyDistributorProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "SetCurrentRewardsWrapperArgsV0",
            },
          },
        ],
      },
      {
        name: "setCurrentRewardsWrapperV1",
        accounts: [
          {
            name: "oracle",
            isMut: true,
            isSigner: true,
          },
          {
            name: "lazyDistributor",
            isMut: false,
            isSigner: false,
          },
          {
            name: "recipient",
            isMut: true,
            isSigner: false,
            relations: ["lazy_distributor"],
          },
          {
            name: "keyToAsset",
            isMut: false,
            isSigner: false,
          },
          {
            name: "oracleSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "oracle_signer",
                },
              ],
            },
          },
          {
            name: "lazyDistributorProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "SetCurrentRewardsWrapperArgsV1",
            },
          },
        ],
      },
    ],
    types: [
      {
        name: "SetCurrentRewardsWrapperArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "entityKey",
              type: "bytes",
            },
            {
              name: "oracleIndex",
              type: "u16",
            },
            {
              name: "currentRewards",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "SetCurrentRewardsWrapperArgsV1",
        type: {
          kind: "struct",
          fields: [
            {
              name: "oracleIndex",
              type: "u16",
            },
            {
              name: "currentRewards",
              type: "u64",
            },
          ],
        },
      },
    ],
  },
  hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8: {
    version: "0.3.3",
    name: "voter_stake_registry",
    instructions: [
      {
        name: "initializeRegistrarV0",
        accounts: [
          {
            name: "registrar",
            isMut: true,
            isSigner: false,
            docs: [
              "The voting registrar. There can only be a single registrar",
              "per governance realm and governing mint.",
            ],
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "realm",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "registrar",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "realm_governing_token_mint",
                },
              ],
            },
          },
          {
            name: "collection",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Registrar",
                  path: "registrar",
                },
              ],
            },
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "realm",
            isMut: false,
            isSigner: false,
            docs: [
              "An spl-governance realm",
              "",
              "realm is validated in the instruction:",
              "- realm is owned by the governance_program_id",
              "- realm_governing_token_mint must be the community or council mint",
              "- realm_authority is realm.authority",
            ],
          },
          {
            name: "governanceProgramId",
            isMut: false,
            isSigner: false,
            docs: [
              "The program id of the spl-governance program the realm belongs to.",
            ],
          },
          {
            name: "realmGoverningTokenMint",
            isMut: false,
            isSigner: false,
            docs: ["Either the realm community mint or the council mint."],
          },
          {
            name: "realmAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proxyConfig",
            isMut: false,
            isSigner: false,
            isOptional: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeRegistrarArgsV0",
            },
          },
        ],
      },
      {
        name: "configureVotingMintV0",
        accounts: [
          {
            name: "registrar",
            isMut: true,
            isSigner: false,
            relations: ["realm_authority"],
          },
          {
            name: "realmAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
            docs: ["Tokens of this mint will produce vote weight"],
          },
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ConfigureVotingMintArgsV0",
            },
          },
        ],
      },
      {
        name: "initializePositionV0",
        accounts: [
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
            relations: ["collection"],
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "positionTokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "vault",
            isMut: true,
            isSigner: false,
          },
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "depositMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializePositionArgsV0",
            },
          },
        ],
      },
      {
        name: "depositV0",
        accounts: [
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "vault",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "depositToken",
            isMut: true,
            isSigner: false,
            relations: ["mint"],
          },
          {
            name: "depositAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "DepositArgsV0",
            },
          },
        ],
      },
      {
        name: "withdrawV0",
        accounts: [
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["registrar", "mint"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "vault",
            isMut: true,
            isSigner: false,
          },
          {
            name: "depositMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "destination",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "WithdrawArgsV0",
            },
          },
        ],
      },
      {
        name: "closePositionV0",
        accounts: [
          {
            name: "solDestination",
            isMut: true,
            isSigner: false,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["mint", "registrar"],
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "resetLockupV0",
        accounts: [
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionUpdateAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["registrar", "mint"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "ResetLockupArgsV0",
            },
          },
        ],
      },
      {
        name: "transferV0",
        accounts: [
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionUpdateAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "sourcePosition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["registrar", "mint"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionTokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "positionAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "targetPosition",
            isMut: true,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "depositMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "sourceVault",
            isMut: true,
            isSigner: false,
          },
          {
            name: "targetVault",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "TransferArgsV0",
            },
          },
        ],
      },
      {
        name: "setTimeOffsetV0",
        accounts: [
          {
            name: "registrar",
            isMut: true,
            isSigner: false,
            relations: ["realm_authority"],
          },
          {
            name: "realmAuthority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "timeOffset",
            type: "i64",
          },
        ],
      },
      {
        name: "ledgerTransferPositionV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "position",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "position",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["mint"],
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "fromTokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "toTokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "from",
            isMut: false,
            isSigner: true,
          },
          {
            name: "to",
            isMut: false,
            isSigner: true,
          },
          {
            name: "approver",
            isMut: false,
            isSigner: true,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "updateRegistrarAuthorityV0",
        accounts: [
          {
            name: "registrar",
            isMut: true,
            isSigner: false,
            relations: ["realm_authority"],
          },
          {
            name: "realmAuthority",
            isMut: false,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateRegistrarAuthorityArgsV0",
            },
          },
        ],
      },
      {
        name: "voteV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "marker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "marker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "ProposalV0",
                  path: "proposal",
                },
              ],
            },
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "voter",
            isMut: false,
            isSigner: true,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proposal",
            isMut: true,
            isSigner: false,
            relations: ["proposal_config"],
          },
          {
            name: "proposalConfig",
            isMut: false,
            isSigner: false,
            relations: ["on_vote_hook", "state_controller"],
          },
          {
            name: "stateController",
            isMut: true,
            isSigner: false,
          },
          {
            name: "onVoteHook",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proposalProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "VoteArgsV0",
            },
          },
        ],
      },
      {
        name: "relinquishVoteV1",
        accounts: [
          {
            name: "marker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "marker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "ProposalV0",
                  path: "proposal",
                },
              ],
            },
            relations: ["registrar", "mint", "rent_refund"],
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "voter",
            isMut: false,
            isSigner: true,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proposal",
            isMut: true,
            isSigner: false,
            relations: ["proposal_config"],
          },
          {
            name: "proposalConfig",
            isMut: false,
            isSigner: false,
            relations: ["on_vote_hook", "state_controller"],
          },
          {
            name: "stateController",
            isMut: true,
            isSigner: false,
          },
          {
            name: "onVoteHook",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proposalProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "rentRefund",
            isMut: true,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "RelinquishVoteArgsV1",
            },
          },
        ],
      },
      {
        name: "relinquishExpiredVoteV0",
        accounts: [
          {
            name: "rentRefund",
            isMut: true,
            isSigner: false,
          },
          {
            name: "marker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "marker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "VoteMarkerV0",
                  path: "marker.mint",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "ProposalV0",
                  path: "proposal",
                },
              ],
            },
            relations: ["proposal", "rent_refund"],
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
          },
          {
            name: "proposal",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "proxiedRelinquishVoteV0",
        accounts: [
          {
            name: "rentRefund",
            isMut: true,
            isSigner: false,
          },
          {
            name: "marker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "marker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "ProposalV0",
                  path: "proposal",
                },
              ],
            },
            relations: ["registrar", "mint", "rent_refund"],
          },
          {
            name: "registrar",
            isMut: false,
            isSigner: false,
          },
          {
            name: "voter",
            isMut: false,
            isSigner: true,
          },
          {
            name: "proxyAssignment",
            isMut: false,
            isSigner: false,
            relations: ["voter"],
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            relations: ["mint", "registrar"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proposal",
            isMut: true,
            isSigner: false,
            relations: ["proposal_config"],
          },
          {
            name: "proposalConfig",
            isMut: false,
            isSigner: false,
            relations: ["on_vote_hook", "state_controller"],
          },
          {
            name: "stateController",
            isMut: true,
            isSigner: false,
          },
          {
            name: "onVoteHook",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proposalProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "RelinquishVoteArgsV1",
            },
          },
        ],
      },
      {
        name: "proxiedVoteV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "marker",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "marker",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "PositionV0",
                  path: "position.mint",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "ProposalV0",
                  path: "proposal",
                },
              ],
            },
          },
          {
            name: "registrar",
            isMut: true,
            isSigner: false,
          },
          {
            name: "voter",
            isMut: false,
            isSigner: true,
          },
          {
            name: "position",
            isMut: true,
            isSigner: false,
            relations: ["registrar"],
          },
          {
            name: "proxyAssignment",
            isMut: false,
            isSigner: false,
            relations: ["voter"],
          },
          {
            name: "proposal",
            isMut: true,
            isSigner: false,
            relations: ["proposal_config"],
          },
          {
            name: "proposalConfig",
            isMut: false,
            isSigner: false,
            relations: ["on_vote_hook", "state_controller"],
          },
          {
            name: "stateController",
            isMut: true,
            isSigner: false,
          },
          {
            name: "onVoteHook",
            isMut: false,
            isSigner: false,
          },
          {
            name: "proposalProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "VoteArgsV0",
            },
          },
        ],
      },
      {
        name: "updateRegistrarV0",
        accounts: [
          {
            name: "registrar",
            isMut: true,
            isSigner: false,
            relations: ["realm_authority"],
          },
          {
            name: "realmAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "proxyConfig",
            isMut: false,
            isSigner: false,
            isOptional: true,
          },
        ],
        args: [],
      },
    ],
    accounts: [
      {
        name: "voteMarkerV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "voter",
              type: "publicKey",
            },
            {
              name: "registrar",
              type: "publicKey",
            },
            {
              name: "proposal",
              type: "publicKey",
            },
            {
              name: "mint",
              type: "publicKey",
            },
            {
              name: "choices",
              type: {
                vec: "u16",
              },
            },
            {
              name: "weight",
              type: "u128",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "deprecatedRelinquished",
              docs: [
                "Whether this vote has been cleared on the position after proposal expired",
                "DEPRECATED. New votes will have markers closed after the vote completes.",
              ],
              type: "bool",
            },
            {
              name: "proxyIndex",
              type: "u16",
            },
            {
              name: "rentRefund",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "positionV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "registrar",
              type: "publicKey",
            },
            {
              name: "mint",
              type: "publicKey",
            },
            {
              name: "lockup",
              type: {
                defined: "Lockup",
              },
            },
            {
              name: "amountDepositedNative",
              type: "u64",
            },
            {
              name: "votingMintConfigIdx",
              type: "u8",
            },
            {
              name: "numActiveVotes",
              type: "u16",
            },
            {
              name: "genesisEnd",
              type: "i64",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "voteController",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "registrar",
        type: {
          kind: "struct",
          fields: [
            {
              name: "governanceProgramId",
              type: "publicKey",
            },
            {
              name: "realm",
              type: "publicKey",
            },
            {
              name: "realmGoverningTokenMint",
              type: "publicKey",
            },
            {
              name: "realmAuthority",
              type: "publicKey",
            },
            {
              name: "timeOffset",
              type: "i64",
            },
            {
              name: "positionUpdateAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "collection",
              type: "publicKey",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "collectionBumpSeed",
              type: "u8",
            },
            {
              name: "reserved1",
              type: {
                array: ["u8", 4],
              },
            },
            {
              name: "reserved2",
              type: {
                array: ["u64", 3],
              },
            },
            {
              name: "proxyConfig",
              type: "publicKey",
            },
            {
              name: "votingMints",
              type: {
                vec: {
                  defined: "VotingMintConfigV0",
                },
              },
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "ConfigureVotingMintArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "idx",
              type: "u16",
            },
            {
              name: "baselineVoteWeightScaledFactor",
              type: "u64",
            },
            {
              name: "maxExtraLockupVoteWeightScaledFactor",
              type: "u64",
            },
            {
              name: "genesisVotePowerMultiplier",
              type: "u8",
            },
            {
              name: "genesisVotePowerMultiplierExpirationTs",
              type: "i64",
            },
            {
              name: "lockupSaturationSecs",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "DepositArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "InitializePositionArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "kind",
              type: {
                defined: "LockupKind",
              },
            },
            {
              name: "periods",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "InitializeRegistrarArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "positionUpdateAuthority",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
      {
        name: "RelinquishVoteArgsV1",
        type: {
          kind: "struct",
          fields: [
            {
              name: "choice",
              type: "u16",
            },
          ],
        },
      },
      {
        name: "ResetLockupArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "kind",
              type: {
                defined: "LockupKind",
              },
            },
            {
              name: "periods",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "TransferArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "UpdateRegistrarAuthorityArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "VoteArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "choice",
              type: "u16",
            },
          ],
        },
      },
      {
        name: "WithdrawArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
      {
        name: "Lockup",
        type: {
          kind: "struct",
          fields: [
            {
              name: "startTs",
              type: "i64",
            },
            {
              name: "endTs",
              type: "i64",
            },
            {
              name: "kind",
              type: {
                defined: "LockupKind",
              },
            },
          ],
        },
      },
      {
        name: "VotingMintConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "mint",
              type: "publicKey",
            },
            {
              name: "baselineVoteWeightScaledFactor",
              type: "u64",
            },
            {
              name: "maxExtraLockupVoteWeightScaledFactor",
              type: "u64",
            },
            {
              name: "genesisVotePowerMultiplier",
              type: "u8",
            },
            {
              name: "genesisVotePowerMultiplierExpirationTs",
              type: "i64",
            },
            {
              name: "lockupSaturationSecs",
              type: "u64",
            },
            {
              name: "reserved",
              type: "i8",
            },
          ],
        },
      },
      {
        name: "LockupKind",
        type: {
          kind: "enum",
          variants: [
            {
              name: "None",
            },
            {
              name: "Cliff",
            },
            {
              name: "Constant",
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "InvalidRate",
        msg: "Exchange rate must be greater than zero",
      },
      {
        code: 6001,
        name: "RatesFull",
        msg: "",
      },
      {
        code: 6002,
        name: "VotingMintNotFound",
        msg: "",
      },
      {
        code: 6003,
        name: "DepositEntryNotFound",
        msg: "",
      },
      {
        code: 6004,
        name: "DepositEntryFull",
        msg: "",
      },
      {
        code: 6005,
        name: "VotingTokenNonZero",
        msg: "",
      },
      {
        code: 6006,
        name: "OutOfBoundsDepositEntryIndex",
        msg: "",
      },
      {
        code: 6007,
        name: "UnusedDepositEntryIndex",
        msg: "",
      },
      {
        code: 6008,
        name: "InsufficientUnlockedTokens",
        msg: "",
      },
      {
        code: 6009,
        name: "UnableToConvert",
        msg: "",
      },
      {
        code: 6010,
        name: "InvalidLockupPeriod",
        msg: "",
      },
      {
        code: 6011,
        name: "InvalidEndTs",
        msg: "",
      },
      {
        code: 6012,
        name: "InvalidDays",
        msg: "",
      },
      {
        code: 6013,
        name: "VotingMintConfigIndexAlreadyInUse",
        msg: "",
      },
      {
        code: 6014,
        name: "OutOfBoundsVotingMintConfigIndex",
        msg: "",
      },
      {
        code: 6015,
        name: "InvalidDecimals",
        msg: "Exchange rate decimals cannot be larger than registrar decimals",
      },
      {
        code: 6016,
        name: "InvalidToDepositAndWithdrawInOneSlot",
        msg: "",
      },
      {
        code: 6017,
        name: "ShouldBeTheFirstIxInATx",
        msg: "",
      },
      {
        code: 6018,
        name: "ForbiddenCpi",
        msg: "",
      },
      {
        code: 6019,
        name: "InvalidMint",
        msg: "",
      },
      {
        code: 6020,
        name: "DebugInstruction",
        msg: "",
      },
      {
        code: 6021,
        name: "ClawbackNotAllowedOnDeposit",
        msg: "",
      },
      {
        code: 6022,
        name: "DepositStillLocked",
        msg: "",
      },
      {
        code: 6023,
        name: "InvalidAuthority",
        msg: "",
      },
      {
        code: 6024,
        name: "InvalidTokenOwnerRecord",
        msg: "",
      },
      {
        code: 6025,
        name: "InvalidRealmAuthority",
        msg: "",
      },
      {
        code: 6026,
        name: "VoterWeightOverflow",
        msg: "",
      },
      {
        code: 6027,
        name: "LockupSaturationMustBePositive",
        msg: "",
      },
      {
        code: 6028,
        name: "VotingMintConfiguredWithDifferentIndex",
        msg: "",
      },
      {
        code: 6029,
        name: "InternalProgramError",
        msg: "",
      },
      {
        code: 6030,
        name: "InsufficientLockedTokens",
        msg: "",
      },
      {
        code: 6031,
        name: "MustKeepTokensLocked",
        msg: "",
      },
      {
        code: 6032,
        name: "InvalidLockupKind",
        msg: "",
      },
      {
        code: 6033,
        name: "InvalidChangeToClawbackDepositEntry",
        msg: "",
      },
      {
        code: 6034,
        name: "InternalErrorBadLockupVoteWeight",
        msg: "",
      },
      {
        code: 6035,
        name: "DepositStartTooFarInFuture",
        msg: "",
      },
      {
        code: 6036,
        name: "VaultTokenNonZero",
        msg: "",
      },
      {
        code: 6037,
        name: "InvalidTimestampArguments",
        msg: "",
      },
      {
        code: 6038,
        name: "CastVoteIsNotAllowed",
        msg: "Cast vote is not allowed on update_voter_weight_record_v0 endpoint",
      },
      {
        code: 6039,
        name: "InvalidProgramId",
        msg: "Program id was not what was expected",
      },
      {
        code: 6040,
        name: "InvalidMintOwner",
        msg: "",
      },
      {
        code: 6041,
        name: "InvalidMintAmount",
        msg: "",
      },
      {
        code: 6042,
        name: "DuplicatedNftDetected",
        msg: "",
      },
      {
        code: 6043,
        name: "InvalidTokenOwnerForVoterWeightRecord",
        msg: "",
      },
      {
        code: 6044,
        name: "NftAlreadyVoted",
        msg: "",
      },
      {
        code: 6045,
        name: "InvalidProposalForNftVoteRecord",
        msg: "",
      },
      {
        code: 6046,
        name: "InvalidTokenOwnerForNftVoteRecord",
        msg: "",
      },
      {
        code: 6047,
        name: "UninitializedAccount",
        msg: "",
      },
      {
        code: 6048,
        name: "PositionNotWritable",
        msg: "",
      },
      {
        code: 6049,
        name: "InvalidVoteRecordForNftVoteRecord",
        msg: "",
      },
      {
        code: 6050,
        name: "VoteRecordMustBeWithdrawn",
        msg: "",
      },
      {
        code: 6051,
        name: "VoterWeightRecordMustBeExpired",
        msg: "",
      },
      {
        code: 6052,
        name: "InvalidMintForPosition",
        msg: "",
      },
      {
        code: 6053,
        name: "InvalidOwner",
        msg: "",
      },
      {
        code: 6054,
        name: "NoDepositOnGenesisPositions",
        msg: "You may not deposit additional tokens on a position created during the genesis period that still has the genesis multiplier",
      },
      {
        code: 6055,
        name: "ActiveVotesExist",
        msg: "Cannot change a position while active votes exist",
      },
      {
        code: 6056,
        name: "UnauthorizedPositionUpdateAuthority",
        msg: "Position update authority must sign off on this transaction",
      },
      {
        code: 6057,
        name: "SamePosition",
        msg: "Cannot transfer to the same position",
      },
      {
        code: 6058,
        name: "MaxChoicesExceeded",
      },
      {
        code: 6059,
        name: "NoVoteForThisChoice",
      },
    ],
  },
  fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6: {
    version: "0.1.0",
    name: "fanout",
    instructions: [
      {
        name: "initializeFanoutV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "authority",
            isMut: false,
            isSigner: false,
          },
          {
            name: "fanout",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "fanout",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "InitializeFanoutArgsV0",
                  },
                  path: "args.name",
                },
              ],
            },
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "fanoutMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collection",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "FanoutV0",
                  path: "fanout",
                },
              ],
            },
          },
          {
            name: "collectionAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "membershipMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "rent",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeFanoutArgsV0",
            },
          },
        ],
      },
      {
        name: "stakeV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "staker",
            isMut: false,
            isSigner: true,
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "fanout",
            isMut: true,
            isSigner: false,
            relations: [
              "membership_mint",
              "token_account",
              "membership_collection",
            ],
          },
          {
            name: "membershipMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "membershipCollection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "membership_collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "membership_collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "fromAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "stakeAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "receiptAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "voucher",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "fanout_voucher",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "StakeArgsV0",
            },
          },
        ],
      },
      {
        name: "unstakeV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "solDestination",
            isMut: true,
            isSigner: false,
          },
          {
            name: "voucher",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "fanout_voucher",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["mint", "fanout", "stake_account"],
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "fanout",
            isMut: true,
            isSigner: false,
            relations: ["membership_mint"],
          },
          {
            name: "membershipMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "receiptAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "voucherAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "toAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "stakeAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
      {
        name: "distributeV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "fanout",
            isMut: true,
            isSigner: false,
            relations: ["token_account", "fanout_mint"],
          },
          {
            name: "fanoutMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "owner",
            isMut: false,
            isSigner: false,
          },
          {
            name: "toAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "voucher",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "fanout_voucher",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
            relations: ["fanout", "mint"],
          },
          {
            name: "mint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "receiptAccount",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
    ],
    accounts: [
      {
        name: "fanoutV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "authority",
              type: "publicKey",
            },
            {
              name: "tokenAccount",
              type: "publicKey",
            },
            {
              name: "fanoutMint",
              type: "publicKey",
            },
            {
              name: "membershipMint",
              type: "publicKey",
            },
            {
              name: "totalShares",
              type: "u64",
            },
            {
              name: "totalStakedShares",
              type: "u64",
            },
            {
              name: "membershipCollection",
              type: "publicKey",
            },
            {
              name: "totalInflow",
              type: "u64",
            },
            {
              name: "lastSnapshotAmount",
              type: "u64",
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "fanoutVoucherV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "fanout",
              type: "publicKey",
            },
            {
              name: "mint",
              type: "publicKey",
            },
            {
              name: "stakeAccount",
              type: "publicKey",
            },
            {
              name: "shares",
              type: "u64",
            },
            {
              name: "totalInflow",
              type: "u64",
            },
            {
              name: "totalDistributed",
              type: "u64",
            },
            {
              name: "totalDust",
              type: "u64",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "InitializeFanoutArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "name",
              type: "string",
            },
          ],
        },
      },
      {
        name: "StakeArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amount",
              type: "u64",
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "ArithmeticError",
        msg: "Error in arithmetic",
      },
    ],
  },
  memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr: {
    version: "0.1.3",
    name: "mobile_entity_manager",
    instructions: [
      {
        name: "approveCarrierV0",
        accounts: [
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "carrier",
            isMut: true,
            isSigner: false,
            relations: ["sub_dao"],
          },
        ],
        args: [],
      },
      {
        name: "initializeCarrierV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "carrier",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "carrier",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "SubDaoV0",
                  path: "sub_dao",
                },
                {
                  kind: "arg",
                  type: {
                    defined: "InitializeCarrierArgsV0",
                  },
                  path: "args.name",
                },
              ],
            },
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dnt_mint"],
          },
          {
            name: "dntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collection",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "CarrierV0",
                  path: "carrier",
                },
              ],
            },
          },
          {
            name: "metadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "masterEdition",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "source",
            isMut: true,
            isSigner: false,
          },
          {
            name: "escrow",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "rent",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeCarrierArgsV0",
            },
          },
        ],
      },
      {
        name: "initializeSubscriberV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "programApproval",
            isMut: false,
            isSigner: false,
          },
          {
            name: "carrier",
            isMut: false,
            isSigner: false,
            relations: [
              "collection",
              "merkle_tree",
              "issuing_authority",
              "sub_dao",
            ],
          },
          {
            name: "issuingAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "helium_entity_manager_program",
              },
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "bubblegumSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection_cpi",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumEntityManagerProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeSubscriberArgsV0",
            },
          },
        ],
      },
      {
        name: "issueCarrierNftV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "programApproval",
            isMut: false,
            isSigner: false,
          },
          {
            name: "carrier",
            isMut: false,
            isSigner: false,
            relations: [
              "collection",
              "merkle_tree",
              "issuing_authority",
              "sub_dao",
            ],
          },
          {
            name: "issuingAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "helium_entity_manager_program",
              },
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "bubblegumSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection_cpi",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumEntityManagerProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "IssueCarrierNftArgsV0",
            },
          },
        ],
      },
      {
        name: "revokeCarrierV0",
        accounts: [
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "carrier",
            isMut: true,
            isSigner: false,
            relations: ["sub_dao"],
          },
        ],
        args: [],
      },
      {
        name: "updateCarrierTreeV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "carrier",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeConfig",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  account: "CarrierV0",
                  path: "carrier.merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "newTreeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "new_merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "newMerkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateCarrierTreeArgsV0",
            },
          },
        ],
      },
      {
        name: "updateCarrierV0",
        accounts: [
          {
            name: "carrier",
            isMut: true,
            isSigner: false,
            relations: ["update_authority"],
          },
          {
            name: "updateAuthority",
            isMut: true,
            isSigner: true,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateCarrierArgsV0",
            },
          },
        ],
      },
      {
        name: "initializeIncentiveProgramV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "issuingAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "programApproval",
            isMut: false,
            isSigner: false,
          },
          {
            name: "carrier",
            isMut: false,
            isSigner: false,
            relations: [
              "collection",
              "merkle_tree",
              "issuing_authority",
              "sub_dao",
            ],
          },
          {
            name: "collection",
            isMut: false,
            isSigner: false,
          },
          {
            name: "collectionMetadata",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "collectionMasterEdition",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "metadata",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  path: "token_metadata_program",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "collection",
                },
                {
                  kind: "const",
                  type: "string",
                  value: "edition",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "token_metadata_program",
              },
            },
          },
          {
            name: "entityCreator",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "entity_creator",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "DaoV0",
                  path: "dao",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "helium_entity_manager_program",
              },
            },
          },
          {
            name: "dao",
            isMut: false,
            isSigner: false,
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["dao"],
          },
          {
            name: "keyToAsset",
            isMut: true,
            isSigner: false,
          },
          {
            name: "incentiveEscrowProgram",
            isMut: true,
            isSigner: false,
          },
          {
            name: "treeAuthority",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "account",
                  type: "publicKey",
                  path: "merkle_tree",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "recipient",
            isMut: false,
            isSigner: false,
          },
          {
            name: "merkleTree",
            isMut: true,
            isSigner: false,
          },
          {
            name: "bubblegumSigner",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "collection_cpi",
                },
              ],
              programId: {
                kind: "account",
                type: "publicKey",
                path: "bubblegum_program",
              },
            },
          },
          {
            name: "tokenMetadataProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "logWrapper",
            isMut: false,
            isSigner: false,
          },
          {
            name: "bubblegumProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "compressionProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "heliumEntityManagerProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeIncentiveProgramArgsV0",
            },
          },
        ],
      },
      {
        name: "updateIncentiveProgramV0",
        accounts: [
          {
            name: "issuingAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "carrier",
            isMut: false,
            isSigner: false,
            relations: ["issuing_authority"],
          },
          {
            name: "incentiveEscrowProgram",
            isMut: true,
            isSigner: false,
            relations: ["carrier"],
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateIncentiveProgramV0Args",
            },
          },
        ],
      },
    ],
    accounts: [
      {
        name: "carrierV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "subDao",
              type: "publicKey",
            },
            {
              name: "updateAuthority",
              type: "publicKey",
            },
            {
              name: "issuingAuthority",
              type: "publicKey",
            },
            {
              name: "collection",
              type: "publicKey",
            },
            {
              name: "escrow",
              type: "publicKey",
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "merkleTree",
              type: "publicKey",
            },
            {
              name: "approved",
              type: "bool",
            },
            {
              name: "collectionBumpSeed",
              type: "u8",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "hexboostAuthority",
              type: "publicKey",
            },
            {
              name: "incentiveEscrowFundBps",
              type: "u16",
            },
          ],
        },
      },
      {
        name: "incentiveEscrowProgramV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "carrier",
              type: "publicKey",
            },
            {
              name: "startTs",
              type: "i64",
            },
            {
              name: "stopTs",
              type: "i64",
            },
            {
              name: "shares",
              type: "u32",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "name",
              type: "string",
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "InitializeCarrierArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "updateAuthority",
              type: "publicKey",
            },
            {
              name: "issuingAuthority",
              type: "publicKey",
            },
            {
              name: "hexboostAuthority",
              type: "publicKey",
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "metadataUrl",
              type: "string",
            },
            {
              name: "incentiveEscrowFundBps",
              type: "u16",
            },
          ],
        },
      },
      {
        name: "InitializeIncentiveProgramArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "name",
              type: "string",
            },
            {
              name: "metadataUrl",
              type: {
                option: "string",
              },
            },
            {
              name: "startTs",
              type: "i64",
            },
            {
              name: "stopTs",
              type: "i64",
            },
            {
              name: "shares",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "InitializeSubscriberArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "entityKey",
              type: "bytes",
            },
            {
              name: "name",
              type: "string",
            },
            {
              name: "metadataUrl",
              type: {
                option: "string",
              },
            },
          ],
        },
      },
      {
        name: "IssueCarrierNftArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "metadataUrl",
              type: {
                option: "string",
              },
            },
          ],
        },
      },
      {
        name: "UpdateCarrierTreeArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "maxDepth",
              type: "u32",
            },
            {
              name: "maxBufferSize",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "UpdateCarrierArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "updateAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "issuingAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "hexboostAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "incentiveEscrowFundBps",
              type: {
                option: "u16",
              },
            },
          ],
        },
      },
      {
        name: "UpdateIncentiveProgramV0Args",
        type: {
          kind: "struct",
          fields: [
            {
              name: "startTs",
              type: {
                option: "i64",
              },
            },
            {
              name: "stopTs",
              type: {
                option: "i64",
              },
            },
            {
              name: "shares",
              type: {
                option: "u32",
              },
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "CarrierNotApproved",
        msg: "The carrier is not approved",
      },
      {
        code: 6001,
        name: "InvalidStringLength",
        msg: "Names, symbols and urls must be less than 32, 10, and 200 characters respectively",
      },
      {
        code: 6002,
        name: "TreeNotFull",
        msg: "Cannot swap tree until it is close to full",
      },
      {
        code: 6003,
        name: "InvalidIncentiveEscrowFundBps",
        msg: "Incentive escrow fund bps cannot be greater than 100%",
      },
    ],
  },
  hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ: {
    version: "0.1.0",
    name: "hexboosting",
    instructions: [
      {
        name: "boostV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "boostConfig",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "boost_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "payment_mint",
                },
              ],
            },
            relations: ["payment_mint", "price_oracle"],
          },
          {
            name: "carrier",
            isMut: false,
            isSigner: false,
            relations: ["hexboost_authority"],
          },
          {
            name: "hexboostAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "priceOracle",
            isMut: false,
            isSigner: false,
          },
          {
            name: "paymentMint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "paymentAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "boostedHex",
            isMut: true,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "associatedTokenProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "BoostArgsV0",
            },
          },
        ],
      },
      {
        name: "initializeBoostConfigV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["authority", "dnt_mint"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "rentReclaimAuthority",
            isMut: false,
            isSigner: false,
          },
          {
            name: "startAuthority",
            isMut: false,
            isSigner: false,
          },
          {
            name: "priceOracle",
            isMut: false,
            isSigner: false,
          },
          {
            name: "dntMint",
            isMut: false,
            isSigner: false,
          },
          {
            name: "boostConfig",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "boost_config",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "dnt_mint",
                },
              ],
            },
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "InitializeBoostConfigArgsV0",
            },
          },
        ],
      },
      {
        name: "startBoostV0",
        accounts: [
          {
            name: "startAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "boostConfig",
            isMut: false,
            isSigner: false,
            relations: ["start_authority"],
          },
          {
            name: "boostedHex",
            isMut: true,
            isSigner: false,
            relations: ["boost_config"],
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "StartBoostArgsV0",
            },
          },
        ],
      },
      {
        name: "startBoostV1",
        accounts: [
          {
            name: "startAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "boostConfig",
            isMut: false,
            isSigner: false,
            relations: ["start_authority"],
          },
          {
            name: "boostedHex",
            isMut: true,
            isSigner: false,
            relations: ["boost_config"],
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "StartBoostArgsV0",
            },
          },
        ],
      },
      {
        name: "closeBoostV0",
        accounts: [
          {
            name: "rentReclaimAuthority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "boostConfig",
            isMut: false,
            isSigner: false,
            relations: ["rent_reclaim_authority"],
          },
          {
            name: "boostedHex",
            isMut: true,
            isSigner: false,
            relations: ["boost_config"],
          },
        ],
        args: [],
      },
      {
        name: "updateBoostConfigV0",
        accounts: [
          {
            name: "subDao",
            isMut: false,
            isSigner: false,
            relations: ["authority"],
          },
          {
            name: "authority",
            isMut: false,
            isSigner: true,
          },
          {
            name: "boostConfig",
            isMut: true,
            isSigner: false,
            relations: ["sub_dao"],
          },
        ],
        args: [
          {
            name: "args",
            type: {
              defined: "UpdateBoostConfigArgsV0",
            },
          },
        ],
      },
    ],
    accounts: [
      {
        name: "boostConfigV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "priceOracle",
              type: "publicKey",
            },
            {
              name: "paymentMint",
              type: "publicKey",
            },
            {
              name: "subDao",
              type: "publicKey",
            },
            {
              name: "rentReclaimAuthority",
              docs: ["Authority to reclaim rent from hexes no longer boosted"],
              type: "publicKey",
            },
            {
              name: "boostPrice",
              docs: [
                "The price in the oracle (usd) to burn boost",
                "For simplicity, this should have the same number of decimals as the price oracle",
              ],
              type: "u64",
            },
            {
              name: "periodLength",
              docs: ["The length of a period (defined as a month in the HIP)"],
              type: "u32",
            },
            {
              name: "minimumPeriods",
              docs: ["The minimum of periods to boost"],
              type: "u16",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "startAuthority",
              docs: ["Authority to start the hex"],
              type: "publicKey",
            },
          ],
        },
      },
      {
        name: "boostedHexV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "boostConfig",
              type: "publicKey",
            },
            {
              name: "location",
              type: "u64",
            },
            {
              name: "startTs",
              type: "i64",
            },
            {
              name: "reserved",
              type: {
                array: ["u64", 8],
              },
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "boostsByPeriod",
              docs: [
                "Each entry represents the boost multiplier for a given period",
              ],
              type: "bytes",
            },
            {
              name: "version",
              type: "u32",
            },
          ],
        },
      },
      {
        name: "boostedHexV1",
        type: {
          kind: "struct",
          fields: [
            {
              name: "deviceType",
              type: {
                defined: "DeviceTypeV0",
              },
            },
            {
              name: "boostConfig",
              type: "publicKey",
            },
            {
              name: "version",
              type: "u32",
            },
            {
              name: "location",
              type: "u64",
            },
            {
              name: "startTs",
              type: "i64",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
            {
              name: "boostsByPeriod",
              docs: [
                "Each entry represents the boost multiplier for a given period",
              ],
              type: "bytes",
            },
          ],
        },
      },
    ],
    types: [
      {
        name: "BoostArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "location",
              type: "u64",
            },
            {
              name: "version",
              type: "u32",
            },
            {
              name: "amounts",
              type: {
                vec: {
                  defined: "BoostAmountV0",
                },
              },
            },
            {
              name: "deviceType",
              type: {
                defined: "DeviceTypeV0",
              },
            },
          ],
        },
      },
      {
        name: "BoostAmountV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "period",
              type: "u16",
            },
            {
              name: "amount",
              type: "u8",
            },
          ],
        },
      },
      {
        name: "InitializeBoostConfigArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "boostPrice",
              docs: ["The price in the oracle (usd) to burn boost"],
              type: "u64",
            },
            {
              name: "periodLength",
              docs: ["The length of a period (defined as a month in the HIP)"],
              type: "u32",
            },
            {
              name: "minimumPeriods",
              docs: ["The minimum of periods to boost"],
              type: "u16",
            },
          ],
        },
      },
      {
        name: "StartBoostArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "startTs",
              type: "i64",
            },
          ],
        },
      },
      {
        name: "UpdateBoostConfigArgsV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "startAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "rentReclaimAuthority",
              type: {
                option: "publicKey",
              },
            },
            {
              name: "boostPrice",
              type: {
                option: "u64",
              },
            },
            {
              name: "minimumPeriods",
              type: {
                option: "u16",
              },
            },
            {
              name: "priceOracle",
              type: {
                option: "publicKey",
              },
            },
          ],
        },
      },
      {
        name: "DeviceTypeV0",
        type: {
          kind: "enum",
          variants: [
            {
              name: "CbrsIndoor",
            },
            {
              name: "CbrsOutdoor",
            },
            {
              name: "WifiIndoor",
            },
            {
              name: "WifiOutdoor",
            },
          ],
        },
      },
    ],
    errors: [
      {
        code: 6000,
        name: "BelowMinimumBoost",
        msg: "Must boost for the minimum boosting duration",
      },
      {
        code: 6001,
        name: "NoOraclePrice",
        msg: "No mobile oracle price",
      },
      {
        code: 6002,
        name: "MaxBoostExceeded",
        msg: "Hex is already boosted the maximum amount of 256x",
      },
      {
        code: 6003,
        name: "InvalidVersion",
        msg: "Hexboost version has changed since this instruction was formed, transaction rejected for safety",
      },
      {
        code: 6004,
        name: "PythError",
        msg: "Error from pyth",
      },
      {
        code: 6005,
        name: "PythPriceNotFound",
        msg: "No pyth price found",
      },
      {
        code: 6006,
        name: "ArithmeticError",
        msg: "Error in arithmetic",
      },
      {
        code: 6007,
        name: "BoostPeriodOver",
        msg: "Cannot boost a period that is in progress or over",
      },
      {
        code: 6008,
        name: "NoEmptyPeriods",
        msg: "Cannot leave a gap in boost periods",
      },
      {
        code: 6009,
        name: "PythPriceFeedStale",
        msg: "Pyth price is stale",
      },
    ],
  },
  noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv: {
    version: "0.0.1",
    name: "no_emit",
    instructions: [
      {
        name: "noEmitV0",
        accounts: [
          {
            name: "payer",
            isMut: true,
            isSigner: true,
          },
          {
            name: "noEmitWallet",
            isMut: false,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "not_emitted",
                },
              ],
            },
          },
          {
            name: "notEmittedCounter",
            isMut: true,
            isSigner: false,
            pda: {
              seeds: [
                {
                  kind: "const",
                  type: "string",
                  value: "not_emitted_counter",
                },
                {
                  kind: "account",
                  type: "publicKey",
                  account: "Mint",
                  path: "mint",
                },
              ],
            },
          },
          {
            name: "tokenAccount",
            isMut: true,
            isSigner: false,
          },
          {
            name: "mint",
            isMut: true,
            isSigner: false,
          },
          {
            name: "tokenProgram",
            isMut: false,
            isSigner: false,
          },
          {
            name: "systemProgram",
            isMut: false,
            isSigner: false,
          },
        ],
        args: [],
      },
    ],
    accounts: [
      {
        name: "notEmittedCounterV0",
        type: {
          kind: "struct",
          fields: [
            {
              name: "amountNotEmitted",
              type: "u64",
            },
            {
              name: "bumpSeed",
              type: "u8",
            },
          ],
        },
      },
    ],
  },
};
