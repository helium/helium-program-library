import * as anchor from "@coral-xyz/anchor";

export const BubblegumIdl: anchor.Idl = {
  address: "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY",
  metadata: {
    name: "bubblegum",
    version: "0.12.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "burn",
      docs: ["Burns a leaf node from the tree."],
      discriminator: [116, 110, 29, 56, 107, 219, 42, 93],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
      ],
    },
    {
      name: "cancel_redeem",
      docs: ["Cancels a redeem."],
      discriminator: [111, 76, 232, 50, 39, 175, 48, 242],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
          writable: true,
          signer: true,
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "voucher",
          writable: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
      ],
    },
    {
      name: "compress",
      docs: ["Compresses a metadata account."],
      discriminator: [82, 193, 176, 117, 176, 21, 115, 253],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
          signer: true,
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
        },
        {
          name: "token_account",
          writable: true,
        },
        {
          name: "mint",
          writable: true,
        },
        {
          name: "metadata",
          writable: true,
        },
        {
          name: "master_edition",
          writable: true,
        },
        {
          name: "payer",
          writable: true,
          signer: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "token_program",
        },
        {
          name: "token_metadata_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [],
    },
    {
      name: "create_tree",
      docs: ["Creates a new tree."],
      discriminator: [165, 83, 136, 142, 89, 202, 47, 220],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          writable: true,
          signer: true,
        },
        {
          name: "tree_creator",
          signer: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "max_depth",
          type: "u32",
        },
        {
          name: "max_buffer_size",
          type: "u32",
        },
        {
          name: "public",
          type: {
            option: "bool",
          },
        },
      ],
    },
    {
      name: "decompress_v1",
      docs: ["Decompresses a leaf node from the tree."],
      discriminator: [54, 85, 76, 70, 228, 250, 164, 81],
      accounts: [
        {
          name: "voucher",
          writable: true,
        },
        {
          name: "leaf_owner",
          writable: true,
          signer: true,
        },
        {
          name: "token_account",
          writable: true,
        },
        {
          name: "mint",
          writable: true,
        },
        {
          name: "mint_authority",
          writable: true,
        },
        {
          name: "metadata",
          writable: true,
        },
        {
          name: "master_edition",
          writable: true,
        },
        {
          name: "system_program",
        },
        {
          name: "sysvar_rent",
        },
        {
          name: "token_metadata_program",
        },
        {
          name: "token_program",
        },
        {
          name: "associated_token_program",
        },
        {
          name: "log_wrapper",
        },
      ],
      args: [
        {
          name: "metadata",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
      ],
    },
    {
      name: "delegate",
      docs: ["Sets a delegate for a leaf node."],
      discriminator: [90, 147, 75, 178, 85, 88, 4, 137],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
          signer: true,
        },
        {
          name: "previous_leaf_delegate",
        },
        {
          name: "new_leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
      ],
    },
    {
      name: "mint_to_collection_v1",
      docs: ["Mints a new asset and adds it to a collection."],
      discriminator: [153, 18, 178, 47, 197, 158, 86, 15],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "tree_delegate",
          signer: true,
        },
        {
          name: "collection_authority",
          signer: true,
        },
        {
          name: "collection_authority_record_pda",
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address.",
          ],
        },
        {
          name: "collection_mint",
        },
        {
          name: "collection_metadata",
          writable: true,
        },
        {
          name: "edition_account",
        },
        {
          name: "bubblegum_signer",
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "token_metadata_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "metadata_args",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
      ],
      returns: {
        defined: {
          name: "LeafSchema",
        },
      },
    },
    {
      name: "mint_v1",
      docs: ["Mints a new asset."],
      discriminator: [145, 98, 192, 118, 184, 147, 118, 104],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "tree_delegate",
          signer: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "message",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
      ],
      returns: {
        defined: {
          name: "LeafSchema",
        },
      },
    },
    {
      name: "redeem",
      docs: [
        "Redeems a vouches.",
        "",
        "Once a vouch is redeemed, the corresponding leaf node is removed from the tree.",
      ],
      discriminator: [184, 12, 86, 149, 70, 196, 97, 225],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
          writable: true,
          signer: true,
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "voucher",
          writable: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
      ],
    },
    {
      name: "set_and_verify_collection",
      docs: ["Sets and verifies a collection to a leaf node"],
      discriminator: [235, 242, 121, 216, 158, 234, 180, 234],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "tree_delegate",
          docs: [
            "This account is checked to be a signer in",
            "the case of `set_and_verify_collection` where",
            "we are actually changing the NFT metadata.",
          ],
        },
        {
          name: "collection_authority",
          signer: true,
        },
        {
          name: "collection_authority_record_pda",
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address.",
          ],
        },
        {
          name: "collection_mint",
        },
        {
          name: "collection_metadata",
          writable: true,
        },
        {
          name: "edition_account",
        },
        {
          name: "bubblegum_signer",
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "token_metadata_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
        {
          name: "message",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
        {
          name: "collection",
          type: "pubkey",
        },
      ],
    },
    {
      name: "set_decompressable_state",
      docs: ["Sets the `decompressible_state` of a tree."],
      discriminator: [18, 135, 238, 168, 246, 195, 61, 115],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
        },
        {
          name: "tree_creator",
          signer: true,
        },
      ],
      args: [
        {
          name: "decompressable_state",
          type: {
            defined: {
              name: "DecompressibleState",
            },
          },
        },
      ],
    },
    {
      name: "set_decompressible_state",
      docs: ["Sets the `decompressible_state` of a tree."],
      discriminator: [82, 104, 152, 6, 149, 111, 100, 13],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
        },
        {
          name: "tree_creator",
          signer: true,
        },
      ],
      args: [
        {
          name: "decompressable_state",
          type: {
            defined: {
              name: "DecompressibleState",
            },
          },
        },
      ],
    },
    {
      name: "set_tree_delegate",
      docs: ["Sets a delegate for a tree."],
      discriminator: [253, 118, 66, 37, 190, 49, 154, 102],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
        },
        {
          name: "tree_creator",
          signer: true,
        },
        {
          name: "new_tree_delegate",
        },
        {
          name: "merkle_tree",
        },
        {
          name: "system_program",
        },
      ],
      args: [],
    },
    {
      name: "transfer",
      docs: ["Transfers a leaf node from one account to another."],
      discriminator: [163, 52, 200, 231, 140, 3, 69, 186],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "new_leaf_owner",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
      ],
    },
    {
      name: "unverify_collection",
      docs: ["Unverifies a collection from a leaf node."],
      discriminator: [250, 251, 42, 106, 41, 137, 186, 168],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "tree_delegate",
          docs: [
            "This account is checked to be a signer in",
            "the case of `set_and_verify_collection` where",
            "we are actually changing the NFT metadata.",
          ],
        },
        {
          name: "collection_authority",
          signer: true,
        },
        {
          name: "collection_authority_record_pda",
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address.",
          ],
        },
        {
          name: "collection_mint",
        },
        {
          name: "collection_metadata",
          writable: true,
        },
        {
          name: "edition_account",
        },
        {
          name: "bubblegum_signer",
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "token_metadata_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
        {
          name: "message",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
      ],
    },
    {
      name: "unverify_creator",
      docs: ["Unverifies a creator from a leaf node."],
      discriminator: [107, 178, 57, 39, 105, 115, 112, 152],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "creator",
          signer: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
        {
          name: "message",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
      ],
    },
    {
      name: "verify_collection",
      docs: ["Verifies a collection for a leaf node."],
      discriminator: [56, 113, 101, 253, 79, 55, 122, 169],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "tree_delegate",
          docs: [
            "This account is checked to be a signer in",
            "the case of `set_and_verify_collection` where",
            "we are actually changing the NFT metadata.",
          ],
        },
        {
          name: "collection_authority",
          signer: true,
        },
        {
          name: "collection_authority_record_pda",
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address.",
          ],
        },
        {
          name: "collection_mint",
        },
        {
          name: "collection_metadata",
          writable: true,
        },
        {
          name: "edition_account",
        },
        {
          name: "bubblegum_signer",
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "token_metadata_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
        {
          name: "message",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
      ],
    },
    {
      name: "verify_creator",
      docs: ["Verifies a creator for a leaf node."],
      discriminator: [52, 17, 96, 132, 71, 4, 85, 194],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "creator",
          signer: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "data_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "creator_hash",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
        {
          name: "message",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
      ],
    },
    {
      name: "update_metadata",
      docs: [
        "Updates metadata for a leaf node that is not part of a verified collection.",
      ],
      discriminator: [170, 182, 43, 239, 97, 78, 225, 186],
      accounts: [
        {
          name: "tree_authority",
        },
        {
          name: "authority",
          docs: [
            "Either collection authority or tree owner/delegate, depending",
            "on whether the item is in a verified collection",
          ],
          signer: true,
        },
        {
          name: "collection_mint",
          docs: ["Used when item is in a verified collection"],
          optional: true,
        },
        {
          name: "collection_metadata",
          docs: ["Used when item is in a verified collection"],
          optional: true,
        },
        {
          name: "collection_authority_record_pda",
          optional: true,
        },
        {
          name: "leaf_owner",
        },
        {
          name: "leaf_delegate",
        },
        {
          name: "payer",
          signer: true,
        },
        {
          name: "merkle_tree",
          writable: true,
        },
        {
          name: "log_wrapper",
        },
        {
          name: "compression_program",
        },
        {
          name: "token_metadata_program",
        },
        {
          name: "system_program",
        },
      ],
      args: [
        {
          name: "root",
          type: {
            array: ["u8", 32],
          },
        },
        {
          name: "nonce",
          type: "u64",
        },
        {
          name: "index",
          type: "u32",
        },
        {
          name: "current_metadata",
          type: {
            defined: {
              name: "MetadataArgs",
            },
          },
        },
        {
          name: "update_args",
          type: {
            defined: {
              name: "UpdateArgs",
            },
          },
        },
      ],
    },
  ],
  accounts: [
    {
      name: "TreeConfig",
      discriminator: [122, 245, 175, 248, 171, 34, 0, 207],
    },
    {
      name: "Voucher",
      discriminator: [191, 204, 149, 234, 213, 165, 13, 65],
    },
  ],
  errors: [
    {
      code: 6000,
      name: "AssetOwnerMismatch",
      msg: "Asset Owner Does not match",
    },
    {
      code: 6001,
      name: "PublicKeyMismatch",
      msg: "PublicKeyMismatch",
    },
    {
      code: 6002,
      name: "HashingMismatch",
      msg: "Hashing Mismatch Within Leaf Schema",
    },
    {
      code: 6003,
      name: "UnsupportedSchemaVersion",
      msg: "Unsupported Schema Version",
    },
    {
      code: 6004,
      name: "CreatorShareTotalMustBe100",
      msg: "Creator shares must sum to 100",
    },
    {
      code: 6005,
      name: "DuplicateCreatorAddress",
      msg: "No duplicate creator addresses in metadata",
    },
    {
      code: 6006,
      name: "CreatorDidNotVerify",
      msg: "Creator did not verify the metadata",
    },
    {
      code: 6007,
      name: "CreatorNotFound",
      msg: "Creator not found in creator Vec",
    },
    {
      code: 6008,
      name: "NoCreatorsPresent",
      msg: "No creators in creator Vec",
    },
    {
      code: 6009,
      name: "CreatorHashMismatch",
      msg: "User-provided creator Vec must result in same user-provided creator hash",
    },
    {
      code: 6010,
      name: "DataHashMismatch",
      msg: "User-provided metadata must result in same user-provided data hash",
    },
    {
      code: 6011,
      name: "CreatorsTooLong",
      msg: "Creators list too long",
    },
    {
      code: 6012,
      name: "MetadataNameTooLong",
      msg: "Name in metadata is too long",
    },
    {
      code: 6013,
      name: "MetadataSymbolTooLong",
      msg: "Symbol in metadata is too long",
    },
    {
      code: 6014,
      name: "MetadataUriTooLong",
      msg: "Uri in metadata is too long",
    },
    {
      code: 6015,
      name: "MetadataBasisPointsTooHigh",
      msg: "Basis points in metadata cannot exceed 10000",
    },
    {
      code: 6016,
      name: "TreeAuthorityIncorrect",
      msg: "Tree creator or tree delegate must sign.",
    },
    {
      code: 6017,
      name: "InsufficientMintCapacity",
      msg: "Not enough unapproved mints left",
    },
    {
      code: 6018,
      name: "NumericalOverflowError",
      msg: "NumericalOverflowError",
    },
    {
      code: 6019,
      name: "IncorrectOwner",
      msg: "Incorrect account owner",
    },
    {
      code: 6020,
      name: "CollectionCannotBeVerifiedInThisInstruction",
      msg: "Cannot Verify Collection in this Instruction",
    },
    {
      code: 6021,
      name: "CollectionNotFound",
      msg: "Collection Not Found on Metadata",
    },
    {
      code: 6022,
      name: "AlreadyVerified",
      msg: "Collection item is already verified.",
    },
    {
      code: 6023,
      name: "AlreadyUnverified",
      msg: "Collection item is already unverified.",
    },
    {
      code: 6024,
      name: "UpdateAuthorityIncorrect",
      msg: "Incorrect leaf metadata update authority.",
    },
    {
      code: 6025,
      name: "LeafAuthorityMustSign",
      msg: "This transaction must be signed by either the leaf owner or leaf delegate",
    },
    {
      code: 6026,
      name: "CollectionMustBeSized",
      msg: "Collection Not Compatable with Compression, Must be Sized",
    },
    {
      code: 6027,
      name: "MetadataMintMismatch",
      msg: "Metadata mint does not match collection mint",
    },
    {
      code: 6028,
      name: "InvalidCollectionAuthority",
      msg: "Invalid collection authority",
    },
    {
      code: 6029,
      name: "InvalidDelegateRecord",
      msg: "Invalid delegate record pda derivation",
    },
    {
      code: 6030,
      name: "CollectionMasterEditionAccountInvalid",
      msg: "Edition account doesnt match collection",
    },
    {
      code: 6031,
      name: "CollectionMustBeAUniqueMasterEdition",
      msg: "Collection Must Be a Unique Master Edition v2",
    },
    {
      code: 6032,
      name: "UnknownExternalError",
      msg: "Could not convert external error to BubblegumError",
    },
    {
      code: 6033,
      name: "DecompressionDisabled",
      msg: "Decompression is disabled for this tree.",
    },
    {
      code: 6034,
      name: "MissingCollectionMintAccount",
      msg: "Missing collection mint account",
    },
    {
      code: 6035,
      name: "MissingCollectionMetadataAccount",
      msg: "Missing collection metadata account",
    },
    {
      code: 6036,
      name: "CollectionMismatch",
      msg: "Collection mismatch",
    },
    {
      code: 6037,
      name: "MetadataImmutable",
      msg: "Metadata not mutable",
    },
    {
      code: 6038,
      name: "PrimarySaleCanOnlyBeFlippedToTrue",
      msg: "Can only update primary sale to true",
    },
    {
      code: 6039,
      name: "CreatorDidNotUnverify",
      msg: "Creator did not unverify the metadata",
    },
    {
      code: 6040,
      name: "InvalidTokenStandard",
      msg: "Only NonFungible standard is supported",
    },
    {
      code: 6041,
      name: "InvalidCanopySize",
      msg: "Canopy size should be set bigger for this tree",
    },
  ],
  types: [
    {
      name: "Creator",
      type: {
        kind: "struct",
        fields: [
          {
            name: "address",
            type: "pubkey",
          },
          {
            name: "verified",
            type: "bool",
          },
          {
            name: "share",
            docs: [
              "The percentage share.",
              "",
              "The value is a percentage, not basis points.",
            ],
            type: "u8",
          },
        ],
      },
    },
    {
      name: "Uses",
      type: {
        kind: "struct",
        fields: [
          {
            name: "use_method",
            type: {
              defined: {
                name: "UseMethod",
              },
            },
          },
          {
            name: "remaining",
            type: "u64",
          },
          {
            name: "total",
            type: "u64",
          },
        ],
      },
    },
    {
      name: "Collection",
      type: {
        kind: "struct",
        fields: [
          {
            name: "verified",
            type: "bool",
          },
          {
            name: "key",
            type: "pubkey",
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
            name: "seller_fee_basis_points",
            docs: [
              "Royalty basis points that goes to creators in secondary sales (0-10000)",
            ],
            type: "u16",
          },
          {
            name: "primary_sale_happened",
            type: "bool",
          },
          {
            name: "is_mutable",
            type: "bool",
          },
          {
            name: "edition_nonce",
            docs: ["nonce for easy calculation of editions, if present"],
            type: {
              option: "u8",
            },
          },
          {
            name: "token_standard",
            docs: [
              "Since we cannot easily change Metadata, we add the new DataV2 fields here at the end.",
            ],
            type: {
              option: {
                defined: {
                  name: "TokenStandard",
                },
              },
            },
          },
          {
            name: "collection",
            docs: ["Collection"],
            type: {
              option: {
                defined: {
                  name: "Collection",
                },
              },
            },
          },
          {
            name: "uses",
            docs: ["Uses"],
            type: {
              option: {
                defined: {
                  name: "Uses",
                },
              },
            },
          },
          {
            name: "token_program_version",
            type: {
              defined: {
                name: "TokenProgramVersion",
              },
            },
          },
          {
            name: "creators",
            type: {
              vec: {
                defined: {
                  name: "Creator",
                },
              },
            },
          },
        ],
      },
    },
    {
      name: "UpdateArgs",
      type: {
        kind: "struct",
        fields: [
          {
            name: "name",
            type: {
              option: "string",
            },
          },
          {
            name: "symbol",
            type: {
              option: "string",
            },
          },
          {
            name: "uri",
            type: {
              option: "string",
            },
          },
          {
            name: "creators",
            type: {
              option: {
                vec: {
                  defined: {
                    name: "Creator",
                  },
                },
              },
            },
          },
          {
            name: "seller_fee_basis_points",
            type: {
              option: "u16",
            },
          },
          {
            name: "primary_sale_happened",
            type: {
              option: "bool",
            },
          },
          {
            name: "is_mutable",
            type: {
              option: "bool",
            },
          },
        ],
      },
    },
    {
      name: "Version",
      type: {
        kind: "enum",
        variants: [
          {
            name: "V1",
          },
        ],
      },
    },
    {
      name: "LeafSchema",
      type: {
        kind: "enum",
        variants: [
          {
            name: "V1",
            fields: [
              {
                name: "id",
                type: "pubkey",
              },
              {
                name: "owner",
                type: "pubkey",
              },
              {
                name: "delegate",
                type: "pubkey",
              },
              {
                name: "nonce",
                type: "u64",
              },
              {
                name: "data_hash",
                type: {
                  array: ["u8", 32],
                },
              },
              {
                name: "creator_hash",
                type: {
                  array: ["u8", 32],
                },
              },
            ],
          },
        ],
      },
    },
    {
      name: "TokenProgramVersion",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Original",
          },
          {
            name: "Token2022",
          },
        ],
      },
    },
    {
      name: "TokenStandard",
      type: {
        kind: "enum",
        variants: [
          {
            name: "NonFungible",
          },
          {
            name: "FungibleAsset",
          },
          {
            name: "Fungible",
          },
          {
            name: "NonFungibleEdition",
          },
        ],
      },
    },
    {
      name: "UseMethod",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Burn",
          },
          {
            name: "Multiple",
          },
          {
            name: "Single",
          },
        ],
      },
    },
    {
      name: "BubblegumEventType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Uninitialized",
          },
          {
            name: "LeafSchemaEvent",
          },
        ],
      },
    },
    {
      name: "DecompressibleState",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Enabled",
          },
          {
            name: "Disabled",
          },
        ],
      },
    },
    {
      name: "InstructionName",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Unknown",
          },
          {
            name: "MintV1",
          },
          {
            name: "Redeem",
          },
          {
            name: "CancelRedeem",
          },
          {
            name: "Transfer",
          },
          {
            name: "Delegate",
          },
          {
            name: "DecompressV1",
          },
          {
            name: "Compress",
          },
          {
            name: "Burn",
          },
          {
            name: "CreateTree",
          },
          {
            name: "VerifyCreator",
          },
          {
            name: "UnverifyCreator",
          },
          {
            name: "VerifyCollection",
          },
          {
            name: "UnverifyCollection",
          },
          {
            name: "SetAndVerifyCollection",
          },
          {
            name: "MintToCollectionV1",
          },
          {
            name: "SetDecompressibleState",
          },
          {
            name: "UpdateMetadata",
          },
        ],
      },
    },
    {
      name: "TreeConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "tree_creator",
            type: "pubkey",
          },
          {
            name: "tree_delegate",
            type: "pubkey",
          },
          {
            name: "total_mint_capacity",
            type: "u64",
          },
          {
            name: "num_minted",
            type: "u64",
          },
          {
            name: "is_public",
            type: "bool",
          },
          {
            name: "is_decompressible",
            type: {
              defined: {
                name: "DecompressibleState",
              },
            },
          },
        ],
      },
    },
    {
      name: "Voucher",
      type: {
        kind: "struct",
        fields: [
          {
            name: "leaf_schema",
            type: {
              defined: {
                name: "LeafSchema",
              },
            },
          },
          {
            name: "index",
            type: "u32",
          },
          {
            name: "merkle_tree",
            type: "pubkey",
          },
        ],
      },
    },
  ],
};
