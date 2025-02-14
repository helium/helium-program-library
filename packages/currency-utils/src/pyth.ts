/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pyth_solana_receiver.json`.
 */
export type PythSolanaReceiver = {
  address: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
  metadata: {
    name: "pythSolanaReceiver";
    version: "0.1.0";
    spec: "0.1.0";
  };
  instructions: [
    {
      name: "initialize";
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "config";
          writable: true;
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "initialConfig";
          type: {
            defined: {
              name: "config";
            };
          };
        }
      ];
    },
    {
      name: "requestGovernanceAuthorityTransfer";
      discriminator: [92, 18, 67, 156, 27, 151, 183, 224];
      accounts: [
        {
          name: "payer";
          signer: true;
        },
        {
          name: "config";
          writable: true;
        }
      ];
      args: [
        {
          name: "targetGovernanceAuthority";
          type: "pubkey";
        }
      ];
    },
    {
      name: "acceptGovernanceAuthorityTransfer";
      discriminator: [254, 39, 222, 79, 64, 217, 205, 127];
      accounts: [
        {
          name: "payer";
          signer: true;
        },
        {
          name: "config";
          writable: true;
        }
      ];
      args: [];
    },
    {
      name: "setDataSources";
      discriminator: [107, 73, 15, 119, 195, 116, 91, 210];
      accounts: [
        {
          name: "payer";
          signer: true;
        },
        {
          name: "config";
          writable: true;
        }
      ];
      args: [
        {
          name: "validDataSources";
          type: {
            vec: {
              defined: {
                name: "dataSource";
              };
            };
          };
        }
      ];
    },
    {
      name: "setFee";
      discriminator: [18, 154, 24, 18, 237, 214, 19, 80];
      accounts: [
        {
          name: "payer";
          signer: true;
        },
        {
          name: "config";
          writable: true;
        }
      ];
      args: [
        {
          name: "singleUpdateFeeInLamports";
          type: "u64";
        }
      ];
    },
    {
      name: "setWormholeAddress";
      discriminator: [154, 174, 252, 157, 91, 215, 179, 156];
      accounts: [
        {
          name: "payer";
          signer: true;
        },
        {
          name: "config";
          writable: true;
        }
      ];
      args: [
        {
          name: "wormhole";
          type: "pubkey";
        }
      ];
    },
    {
      name: "setMinimumSignatures";
      discriminator: [5, 210, 206, 124, 43, 68, 104, 149];
      accounts: [
        {
          name: "payer";
          signer: true;
        },
        {
          name: "config";
          writable: true;
        }
      ];
      args: [
        {
          name: "minimumSignatures";
          type: "u8";
        }
      ];
    },
    {
      name: "postUpdateAtomic";
      docs: [
        "Post a price update using a VAA and a MerklePriceUpdate.",
        "This function allows you to post a price update in a single transaction.",
        "Compared to post_update, it is less secure since you won't be able to verify all guardian signatures if you use this function because of transaction size limitations.",
        "Typically, you can fit 5 guardian signatures in a transaction that uses this."
      ];
      discriminator: [49, 172, 84, 192, 175, 180, 52, 234];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "guardianSet";
          docs: [
            "Instead we do the same steps in deserialize_guardian_set_checked."
          ];
        },
        {
          name: "config";
        },
        {
          name: "treasury";
          writable: true;
        },
        {
          name: "priceUpdateAccount";
          docs: [
            "The contraint is such that either the price_update_account is uninitialized or the payer is the write_authority.",
            "Pubkey::default() is the SystemProgram on Solana and it can't sign so it's impossible that price_update_account.write_authority == Pubkey::default() once the account is initialized"
          ];
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
        },
        {
          name: "writeAuthority";
          signer: true;
        }
      ];
      args: [
        {
          name: "params";
          type: {
            defined: {
              name: "postUpdateAtomicParams";
            };
          };
        }
      ];
    },
    {
      name: "postUpdate";
      docs: [
        "Post a price update using an encoded_vaa account and a MerklePriceUpdate calldata.",
        "This should be called after the client has already verified the Vaa via the Wormhole contract.",
        "Check out target_chains/solana/cli/src/main.rs for an example of how to do this."
      ];
      discriminator: [133, 95, 207, 175, 11, 79, 118, 44];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "encodedVaa";
        },
        {
          name: "config";
        },
        {
          name: "treasury";
          writable: true;
        },
        {
          name: "priceUpdateAccount";
          docs: [
            "The contraint is such that either the price_update_account is uninitialized or the payer is the write_authority.",
            "Pubkey::default() is the SystemProgram on Solana and it can't sign so it's impossible that price_update_account.write_authority == Pubkey::default() once the account is initialized"
          ];
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
        },
        {
          name: "writeAuthority";
          signer: true;
        }
      ];
      args: [
        {
          name: "params";
          type: {
            defined: {
              name: "postUpdateParams";
            };
          };
        }
      ];
    },
    {
      name: "reclaimRent";
      discriminator: [218, 200, 19, 197, 227, 89, 192, 22];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "priceUpdateAccount";
          writable: true;
        }
      ];
      args: [];
    }
  ];
  accounts: [
    {
      name: "config";
      discriminator: [155, 12, 170, 224, 30, 250, 204, 130];
    },
    {
      name: "priceUpdateV2";
      discriminator: [70, 9, 59, 15, 151, 95, 3, 234];
    }
  ];
  errors: [
    {
      code: 6000;
      name: "invalidWormholeMessage";
      msg: "Received an invalid wormhole message";
    },
    {
      code: 6001;
      name: "deserializeMessageFailed";
      msg: "An error occurred when deserializing the message";
    },
    {
      code: 6002;
      name: "invalidPriceUpdate";
      msg: "Received an invalid price update";
    },
    {
      code: 6003;
      name: "unsupportedMessageType";
      msg: "This type of message is not supported currently";
    },
    {
      code: 6004;
      name: "invalidDataSource";
      msg: "The tuple emitter chain, emitter doesn't match one of the valid data sources.";
    },
    {
      code: 6005;
      name: "insufficientFunds";
      msg: "Funds are insufficient to pay the receiving fee";
    },
    {
      code: 6006;
      name: "wrongWriteAuthority";
      msg: "This signer can't write to price update account";
    },
    {
      code: 6007;
      name: "wrongVaaOwner";
      msg: "The posted VAA account has the wrong owner.";
    },
    {
      code: 6008;
      name: "deserializeVaaFailed";
      msg: "An error occurred when deserializing the VAA.";
    },
    {
      code: 6009;
      name: "insufficientGuardianSignatures";
      msg: "The number of guardian signatures is below the minimum";
    },
    {
      code: 6010;
      name: "invalidVaaVersion";
      msg: "Invalid VAA version";
    },
    {
      code: 6011;
      name: "guardianSetMismatch";
      msg: "Guardian set version in the VAA doesn't match the guardian set passed";
    },
    {
      code: 6012;
      name: "invalidGuardianOrder";
      msg: "Guardian signature indices must be increasing";
    },
    {
      code: 6013;
      name: "invalidGuardianIndex";
      msg: "Guardian index exceeds the number of guardians in the set";
    },
    {
      code: 6014;
      name: "invalidSignature";
      msg: "A VAA signature is invalid";
    },
    {
      code: 6015;
      name: "invalidGuardianKeyRecovery";
      msg: "The recovered guardian public key doesn't match the guardian set";
    },
    {
      code: 6016;
      name: "wrongGuardianSetOwner";
      msg: "The guardian set account is owned by the wrong program";
    },
    {
      code: 6017;
      name: "invalidGuardianSetPda";
      msg: "The Guardian Set account doesn't match the PDA derivation";
    },
    {
      code: 6018;
      name: "guardianSetExpired";
      msg: "The Guardian Set is expired";
    },
    {
      code: 6019;
      name: "governanceAuthorityMismatch";
      msg: "The signer is not authorized to perform this governance action";
    },
    {
      code: 6020;
      name: "targetGovernanceAuthorityMismatch";
      msg: "The signer is not authorized to accept the governance authority";
    },
    {
      code: 6021;
      name: "nonexistentGovernanceAuthorityTransferRequest";
      msg: "The governance authority needs to request a transfer first";
    }
  ];
  types: [
    {
      name: "priceFeedMessage";
      type: {
        kind: "struct";
        fields: [
          {
            name: "feedId";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "price";
            type: "i64";
          },
          {
            name: "conf";
            type: "u64";
          },
          {
            name: "exponent";
            type: "i32";
          },
          {
            name: "publishTime";
            type: "i64";
          },
          {
            name: "prevPublishTime";
            type: "i64";
          },
          {
            name: "emaPrice";
            type: "i64";
          },
          {
            name: "emaConf";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "merklePriceUpdate";
      type: {
        kind: "struct";
        fields: [
          {
            name: "message";
            type: "bytes";
          },
          {
            name: "proof";
            type: {
              vec: {
                array: ["u8", 20];
              };
            };
          }
        ];
      };
    },
    {
      name: "dataSource";
      type: {
        kind: "struct";
        fields: [
          {
            name: "chain";
            type: "u16";
          },
          {
            name: "emitter";
            type: "pubkey";
          }
        ];
      };
    },
    {
      name: "postUpdateAtomicParams";
      type: {
        kind: "struct";
        fields: [
          {
            name: "vaa";
            type: "bytes";
          },
          {
            name: "merklePriceUpdate";
            type: {
              defined: {
                name: "merklePriceUpdate";
              };
            };
          },
          {
            name: "treasuryId";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "postUpdateParams";
      type: {
        kind: "struct";
        fields: [
          {
            name: "merklePriceUpdate";
            type: {
              defined: {
                name: "merklePriceUpdate";
              };
            };
          },
          {
            name: "treasuryId";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "verificationLevel";
      docs: [
        "* This enum represents how many guardian signatures were checked for a Pythnet price update\n * If full, guardian quorum has been attained\n * If partial, at least config.minimum signatures have been verified, but in the case config.minimum_signatures changes in the future we also include the number of signatures that were checked"
      ];
      type: {
        kind: "enum";
        variants: [
          {
            name: "partial";
            fields: [
              {
                name: "numSignatures";
                type: "u8";
              }
            ];
          },
          {
            name: "full";
          }
        ];
      };
    },
    {
      name: "config";
      type: {
        kind: "struct";
        fields: [
          {
            name: "governanceAuthority";
            type: "pubkey";
          },
          {
            name: "targetGovernanceAuthority";
            type: {
              option: "pubkey";
            };
          },
          {
            name: "wormhole";
            type: "pubkey";
          },
          {
            name: "validDataSources";
            type: {
              vec: {
                defined: {
                  name: "dataSource";
                };
              };
            };
          },
          {
            name: "singleUpdateFeeInLamports";
            type: "u64";
          },
          {
            name: "minimumSignatures";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "priceUpdateV2";
      type: {
        kind: "struct";
        fields: [
          {
            name: "writeAuthority";
            type: "pubkey";
          },
          {
            name: "verificationLevel";
            type: {
              defined: {
                name: "verificationLevel";
              };
            };
          },
          {
            name: "priceMessage";
            type: {
              defined: {
                name: "priceFeedMessage";
              };
            };
          },
          {
            name: "postedSlot";
            type: "u64";
          }
        ];
      };
    }
  ];
};

export const IDL = {
  address: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
  metadata: {
    name: "pyth_solana_receiver",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "initialize",
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
      accounts: [
        {
          name: "payer",
          writable: true,
          signer: true,
        },
        {
          name: "config",
          writable: true,
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "initial_config",
          type: {
            defined: {
              name: "Config",
            },
          },
        },
      ],
    },
    {
      name: "request_governance_authority_transfer",
      discriminator: [92, 18, 67, 156, 27, 151, 183, 224],
      accounts: [
        {
          name: "payer",
          signer: true,
        },
        {
          name: "config",
          writable: true,
        },
      ],
      args: [
        {
          name: "target_governance_authority",
          type: "pubkey",
        },
      ],
    },
    {
      name: "accept_governance_authority_transfer",
      discriminator: [254, 39, 222, 79, 64, 217, 205, 127],
      accounts: [
        {
          name: "payer",
          signer: true,
        },
        {
          name: "config",
          writable: true,
        },
      ],
      args: [],
    },
    {
      name: "set_data_sources",
      discriminator: [107, 73, 15, 119, 195, 116, 91, 210],
      accounts: [
        {
          name: "payer",
          signer: true,
        },
        {
          name: "config",
          writable: true,
        },
      ],
      args: [
        {
          name: "valid_data_sources",
          type: {
            vec: {
              defined: {
                name: "DataSource",
              },
            },
          },
        },
      ],
    },
    {
      name: "set_fee",
      discriminator: [18, 154, 24, 18, 237, 214, 19, 80],
      accounts: [
        {
          name: "payer",
          signer: true,
        },
        {
          name: "config",
          writable: true,
        },
      ],
      args: [
        {
          name: "single_update_fee_in_lamports",
          type: "u64",
        },
      ],
    },
    {
      name: "set_wormhole_address",
      discriminator: [154, 174, 252, 157, 91, 215, 179, 156],
      accounts: [
        {
          name: "payer",
          signer: true,
        },
        {
          name: "config",
          writable: true,
        },
      ],
      args: [
        {
          name: "wormhole",
          type: "pubkey",
        },
      ],
    },
    {
      name: "set_minimum_signatures",
      discriminator: [5, 210, 206, 124, 43, 68, 104, 149],
      accounts: [
        {
          name: "payer",
          signer: true,
        },
        {
          name: "config",
          writable: true,
        },
      ],
      args: [
        {
          name: "minimum_signatures",
          type: "u8",
        },
      ],
    },
    {
      name: "post_update_atomic",
      docs: [
        "Post a price update using a VAA and a MerklePriceUpdate.",
        "This function allows you to post a price update in a single transaction.",
        "Compared to post_update, it is less secure since you won't be able to verify all guardian signatures if you use this function because of transaction size limitations.",
        "Typically, you can fit 5 guardian signatures in a transaction that uses this.",
      ],
      discriminator: [49, 172, 84, 192, 175, 180, 52, 234],
      accounts: [
        {
          name: "payer",
          writable: true,
          signer: true,
        },
        {
          name: "guardian_set",
          docs: [
            "Instead we do the same steps in deserialize_guardian_set_checked.",
          ],
        },
        {
          name: "config",
        },
        {
          name: "treasury",
          writable: true,
        },
        {
          name: "price_update_account",
          docs: [
            "The contraint is such that either the price_update_account is uninitialized or the payer is the write_authority.",
            "Pubkey::default() is the SystemProgram on Solana and it can't sign so it's impossible that price_update_account.write_authority == Pubkey::default() once the account is initialized",
          ],
          writable: true,
          signer: true,
        },
        {
          name: "system_program",
        },
        {
          name: "write_authority",
          signer: true,
        },
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "PostUpdateAtomicParams",
            },
          },
        },
      ],
    },
    {
      name: "post_update",
      docs: [
        "Post a price update using an encoded_vaa account and a MerklePriceUpdate calldata.",
        "This should be called after the client has already verified the Vaa via the Wormhole contract.",
        "Check out target_chains/solana/cli/src/main.rs for an example of how to do this.",
      ],
      discriminator: [133, 95, 207, 175, 11, 79, 118, 44],
      accounts: [
        {
          name: "payer",
          writable: true,
          signer: true,
        },
        {
          name: "encoded_vaa",
        },
        {
          name: "config",
        },
        {
          name: "treasury",
          writable: true,
        },
        {
          name: "price_update_account",
          docs: [
            "The contraint is such that either the price_update_account is uninitialized or the payer is the write_authority.",
            "Pubkey::default() is the SystemProgram on Solana and it can't sign so it's impossible that price_update_account.write_authority == Pubkey::default() once the account is initialized",
          ],
          writable: true,
          signer: true,
        },
        {
          name: "system_program",
        },
        {
          name: "write_authority",
          signer: true,
        },
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "PostUpdateParams",
            },
          },
        },
      ],
    },
    {
      name: "reclaim_rent",
      discriminator: [218, 200, 19, 197, 227, 89, 192, 22],
      accounts: [
        {
          name: "payer",
          writable: true,
          signer: true,
        },
        {
          name: "price_update_account",
          writable: true,
        },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "Config",
      discriminator: [155, 12, 170, 224, 30, 250, 204, 130],
    },
    {
      name: "priceUpdateV2",
      discriminator: [70, 9, 59, 15, 151, 95, 3, 234],
    },
  ],
  errors: [
    {
      code: 6000,
      name: "InvalidWormholeMessage",
      msg: "Received an invalid wormhole message",
    },
    {
      code: 6001,
      name: "DeserializeMessageFailed",
      msg: "An error occurred when deserializing the message",
    },
    {
      code: 6002,
      name: "InvalidPriceUpdate",
      msg: "Received an invalid price update",
    },
    {
      code: 6003,
      name: "UnsupportedMessageType",
      msg: "This type of message is not supported currently",
    },
    {
      code: 6004,
      name: "InvalidDataSource",
      msg: "The tuple emitter chain, emitter doesn't match one of the valid data sources.",
    },
    {
      code: 6005,
      name: "InsufficientFunds",
      msg: "Funds are insufficient to pay the receiving fee",
    },
    {
      code: 6006,
      name: "WrongWriteAuthority",
      msg: "This signer can't write to price update account",
    },
    {
      code: 6007,
      name: "WrongVaaOwner",
      msg: "The posted VAA account has the wrong owner.",
    },
    {
      code: 6008,
      name: "DeserializeVaaFailed",
      msg: "An error occurred when deserializing the VAA.",
    },
    {
      code: 6009,
      name: "InsufficientGuardianSignatures",
      msg: "The number of guardian signatures is below the minimum",
    },
    {
      code: 6010,
      name: "InvalidVaaVersion",
      msg: "Invalid VAA version",
    },
    {
      code: 6011,
      name: "GuardianSetMismatch",
      msg: "Guardian set version in the VAA doesn't match the guardian set passed",
    },
    {
      code: 6012,
      name: "InvalidGuardianOrder",
      msg: "Guardian signature indices must be increasing",
    },
    {
      code: 6013,
      name: "InvalidGuardianIndex",
      msg: "Guardian index exceeds the number of guardians in the set",
    },
    {
      code: 6014,
      name: "InvalidSignature",
      msg: "A VAA signature is invalid",
    },
    {
      code: 6015,
      name: "InvalidGuardianKeyRecovery",
      msg: "The recovered guardian public key doesn't match the guardian set",
    },
    {
      code: 6016,
      name: "WrongGuardianSetOwner",
      msg: "The guardian set account is owned by the wrong program",
    },
    {
      code: 6017,
      name: "InvalidGuardianSetPda",
      msg: "The Guardian Set account doesn't match the PDA derivation",
    },
    {
      code: 6018,
      name: "GuardianSetExpired",
      msg: "The Guardian Set is expired",
    },
    {
      code: 6019,
      name: "GovernanceAuthorityMismatch",
      msg: "The signer is not authorized to perform this governance action",
    },
    {
      code: 6020,
      name: "TargetGovernanceAuthorityMismatch",
      msg: "The signer is not authorized to accept the governance authority",
    },
    {
      code: 6021,
      name: "NonexistentGovernanceAuthorityTransferRequest",
      msg: "The governance authority needs to request a transfer first",
    },
  ],
  types: [
    {
      name: "PriceFeedMessage",
      type: {
        kind: "struct",
        fields: [
          {
            name: "feed_id",
            type: {
              array: ["u8", 32],
            },
          },
          {
            name: "price",
            type: "i64",
          },
          {
            name: "conf",
            type: "u64",
          },
          {
            name: "exponent",
            type: "i32",
          },
          {
            name: "publish_time",
            type: "i64",
          },
          {
            name: "prev_publish_time",
            type: "i64",
          },
          {
            name: "ema_price",
            type: "i64",
          },
          {
            name: "ema_conf",
            type: "u64",
          },
        ],
      },
    },
    {
      name: "MerklePriceUpdate",
      type: {
        kind: "struct",
        fields: [
          {
            name: "message",
            type: "bytes",
          },
          {
            name: "proof",
            type: {
              vec: {
                array: ["u8", 20],
              },
            },
          },
        ],
      },
    },
    {
      name: "DataSource",
      type: {
        kind: "struct",
        fields: [
          {
            name: "chain",
            type: "u16",
          },
          {
            name: "emitter",
            type: "pubkey",
          },
        ],
      },
    },
    {
      name: "PostUpdateAtomicParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vaa",
            type: "bytes",
          },
          {
            name: "merkle_price_update",
            type: {
              defined: {
                name: "MerklePriceUpdate",
              },
            },
          },
          {
            name: "treasury_id",
            type: "u8",
          },
        ],
      },
    },
    {
      name: "PostUpdateParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "merkle_price_update",
            type: {
              defined: {
                name: "MerklePriceUpdate",
              },
            },
          },
          {
            name: "treasury_id",
            type: "u8",
          },
        ],
      },
    },
    {
      name: "VerificationLevel",
      docs: [
        "* This enum represents how many guardian signatures were checked for a Pythnet price update\n * If full, guardian quorum has been attained\n * If partial, at least config.minimum signatures have been verified, but in the case config.minimum_signatures changes in the future we also include the number of signatures that were checked",
      ],
      type: {
        kind: "enum",
        variants: [
          {
            name: "Partial",
            fields: [
              {
                name: "num_signatures",
                type: "u8",
              },
            ],
          },
          {
            name: "Full",
          },
        ],
      },
    },
    {
      name: "Config",
      type: {
        kind: "struct",
        fields: [
          {
            name: "governance_authority",
            type: "pubkey",
          },
          {
            name: "target_governance_authority",
            type: {
              option: "pubkey",
            },
          },
          {
            name: "wormhole",
            type: "pubkey",
          },
          {
            name: "valid_data_sources",
            type: {
              vec: {
                defined: {
                  name: "DataSource",
                },
              },
            },
          },
          {
            name: "single_update_fee_in_lamports",
            type: "u64",
          },
          {
            name: "minimum_signatures",
            type: "u8",
          },
        ],
      },
    },
    {
      name: "priceUpdateV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "write_authority",
            type: "pubkey",
          },
          {
            name: "verification_level",
            type: {
              defined: {
                name: "VerificationLevel",
              },
            },
          },
          {
            name: "price_message",
            type: {
              defined: {
                name: "PriceFeedMessage",
              },
            },
          },
          {
            name: "posted_slot",
            type: "u64",
          },
        ],
      },
    },
  ],
};
