/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bubblegum.json`.
 */
export type Bubblegum = {
  address: "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
  metadata: {
    name: "bubblegum";
    version: "0.3.0";
    spec: "0.1.0";
  };
  instructions: [
    {
      name: "createTree";
      discriminator: [165, 83, 136, 142, 89, 202, 47, 220];
      accounts: [
        {
          name: "treeAuthority";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "treeCreator";
          signer: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "maxDepth";
          type: "u32";
        },
        {
          name: "maxBufferSize";
          type: "u32";
        },
        {
          name: "public";
          type: {
            option: "bool";
          };
        }
      ];
    },
    {
      name: "setTreeDelegate";
      discriminator: [253, 118, 66, 37, 190, 49, 154, 102];
      accounts: [
        {
          name: "treeAuthority";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
          relations: ["treeCreator"];
        },
        {
          name: "treeCreator";
          signer: true;
        },
        {
          name: "newTreeDelegate";
        },
        {
          name: "merkleTree";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [];
    },
    {
      name: "mintV1";
      discriminator: [145, 98, 192, 118, 184, 147, 118, 104];
      accounts: [
        {
          name: "treeAuthority";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          signer: true;
        },
        {
          name: "treeDelegate";
          signer: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "message";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        }
      ];
    },
    {
      name: "mintToCollectionV1";
      discriminator: [153, 18, 178, 47, 197, 158, 86, 15];
      accounts: [
        {
          name: "treeAuthority";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          signer: true;
        },
        {
          name: "treeDelegate";
          signer: true;
        },
        {
          name: "collectionAuthority";
          signer: true;
        },
        {
          name: "collectionAuthorityRecordPda";
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address."
          ];
        },
        {
          name: "collectionMint";
        },
        {
          name: "collectionMetadata";
          writable: true;
        },
        {
          name: "editionAccount";
        },
        {
          name: "bubblegumSigner";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  34,
                  99,
                  111,
                  108,
                  108,
                  101,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  99,
                  112,
                  105,
                  34
                ];
              }
            ];
          };
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "tokenMetadataProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "metadataArgs";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        }
      ];
    },
    {
      name: "verifyCreator";
      discriminator: [52, 17, 96, 132, 71, 4, 85, 194];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          signer: true;
        },
        {
          name: "creator";
          signer: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        },
        {
          name: "message";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        }
      ];
    },
    {
      name: "unverifyCreator";
      discriminator: [107, 178, 57, 39, 105, 115, 112, 152];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          signer: true;
        },
        {
          name: "creator";
          signer: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        },
        {
          name: "message";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        }
      ];
    },
    {
      name: "verifyCollection";
      discriminator: [56, 113, 101, 253, 79, 55, 122, 169];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          signer: true;
        },
        {
          name: "treeDelegate";
          docs: [
            "the case of `set_and_verify_collection` where",
            "we are actually changing the NFT metadata."
          ];
        },
        {
          name: "collectionAuthority";
          signer: true;
        },
        {
          name: "collectionAuthorityRecordPda";
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address."
          ];
        },
        {
          name: "collectionMint";
        },
        {
          name: "collectionMetadata";
          writable: true;
        },
        {
          name: "editionAccount";
        },
        {
          name: "bubblegumSigner";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  34,
                  99,
                  111,
                  108,
                  108,
                  101,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  99,
                  112,
                  105,
                  34
                ];
              }
            ];
          };
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "tokenMetadataProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        },
        {
          name: "message";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        }
      ];
    },
    {
      name: "unverifyCollection";
      discriminator: [250, 251, 42, 106, 41, 137, 186, 168];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          signer: true;
        },
        {
          name: "treeDelegate";
          docs: [
            "the case of `set_and_verify_collection` where",
            "we are actually changing the NFT metadata."
          ];
        },
        {
          name: "collectionAuthority";
          signer: true;
        },
        {
          name: "collectionAuthorityRecordPda";
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address."
          ];
        },
        {
          name: "collectionMint";
        },
        {
          name: "collectionMetadata";
          writable: true;
        },
        {
          name: "editionAccount";
        },
        {
          name: "bubblegumSigner";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  34,
                  99,
                  111,
                  108,
                  108,
                  101,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  99,
                  112,
                  105,
                  34
                ];
              }
            ];
          };
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "tokenMetadataProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        },
        {
          name: "message";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        }
      ];
    },
    {
      name: "setAndVerifyCollection";
      discriminator: [235, 242, 121, 216, 158, 234, 180, 234];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "payer";
          signer: true;
        },
        {
          name: "treeDelegate";
          docs: [
            "the case of `set_and_verify_collection` where",
            "we are actually changing the NFT metadata."
          ];
        },
        {
          name: "collectionAuthority";
          signer: true;
        },
        {
          name: "collectionAuthorityRecordPda";
          docs: [
            "If there is no collecton authority record PDA then",
            "this must be the Bubblegum program address."
          ];
        },
        {
          name: "collectionMint";
        },
        {
          name: "collectionMetadata";
          writable: true;
        },
        {
          name: "editionAccount";
        },
        {
          name: "bubblegumSigner";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  34,
                  99,
                  111,
                  108,
                  108,
                  101,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  99,
                  112,
                  105,
                  34
                ];
              }
            ];
          };
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "tokenMetadataProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        },
        {
          name: "message";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        },
        {
          name: "collection";
          type: "pubkey";
        }
      ];
    },
    {
      name: "transfer";
      discriminator: [163, 52, 200, 231, 140, 3, 69, 186];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "newLeafOwner";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        }
      ];
    },
    {
      name: "delegate";
      discriminator: [90, 147, 75, 178, 85, 88, 4, 137];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
          signer: true;
        },
        {
          name: "previousLeafDelegate";
        },
        {
          name: "newLeafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        }
      ];
    },
    {
      name: "burn";
      discriminator: [116, 110, 29, 56, 107, 219, 42, 93];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        }
      ];
    },
    {
      name: "redeem";
      discriminator: [184, 12, 86, 149, 70, 196, 97, 225];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
          writable: true;
          signer: true;
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "voucher";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [34, 118, 111, 117, 99, 104, 101, 114, 34];
              },
              {
                kind: "account";
                path: "merkleTree";
              },
              {
                kind: "arg";
                path: "nonce";
              }
            ];
          };
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "dataHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "creatorHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "nonce";
          type: "u64";
        },
        {
          name: "index";
          type: "u32";
        }
      ];
    },
    {
      name: "cancelRedeem";
      discriminator: [111, 76, 232, 50, 39, 175, 48, 242];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
          writable: true;
          signer: true;
        },
        {
          name: "merkleTree";
          writable: true;
        },
        {
          name: "voucher";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [34, 118, 111, 117, 99, 104, 101, 114, 34];
              },
              {
                kind: "account";
                path: "merkleTree";
              },
              {
                kind: "account";
                path: "voucher.leaf_schema";
                account: "voucher";
              }
            ];
          };
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "root";
          type: {
            array: ["u8", 32];
          };
        }
      ];
    },
    {
      name: "decompressV1";
      discriminator: [54, 85, 76, 70, 228, 250, 164, 81];
      accounts: [
        {
          name: "voucher";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [34, 118, 111, 117, 99, 104, 101, 114, 34];
              },
              {
                kind: "account";
                path: "voucher.merkle_tree";
                account: "voucher";
              },
              {
                kind: "account";
                path: "voucher.leaf_schema";
                account: "voucher";
              }
            ];
          };
        },
        {
          name: "leafOwner";
          writable: true;
          signer: true;
        },
        {
          name: "tokenAccount";
          writable: true;
        },
        {
          name: "mint";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [34, 97, 115, 115, 101, 116, 34];
              },
              {
                kind: "account";
                path: "voucher.merkle_tree";
                account: "voucher";
              },
              {
                kind: "account";
                path: "voucher.leaf_schema";
                account: "voucher";
              }
            ];
          };
        },
        {
          name: "mintAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "mint";
              }
            ];
          };
        },
        {
          name: "metadata";
          writable: true;
        },
        {
          name: "masterEdition";
          writable: true;
        },
        {
          name: "systemProgram";
        },
        {
          name: "sysvarRent";
        },
        {
          name: "tokenMetadataProgram";
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
        },
        {
          name: "logWrapper";
        }
      ];
      args: [
        {
          name: "metadata";
          type: {
            defined: {
              name: "metadataArgs";
            };
          };
        }
      ];
    },
    {
      name: "compress";
      discriminator: [82, 193, 176, 117, 176, 21, 115, 253];
      accounts: [
        {
          name: "treeAuthority";
          pda: {
            seeds: [
              {
                kind: "account";
                path: "merkleTree";
              }
            ];
          };
        },
        {
          name: "leafOwner";
          signer: true;
        },
        {
          name: "leafDelegate";
        },
        {
          name: "merkleTree";
        },
        {
          name: "tokenAccount";
          writable: true;
        },
        {
          name: "mint";
          writable: true;
        },
        {
          name: "metadata";
          writable: true;
        },
        {
          name: "masterEdition";
          writable: true;
        },
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "logWrapper";
        },
        {
          name: "compressionProgram";
        },
        {
          name: "tokenProgram";
        },
        {
          name: "tokenMetadataProgram";
        },
        {
          name: "systemProgram";
        }
      ];
      args: [];
    }
  ];
  accounts: [
    {
      name: "treeConfig";
      discriminator: [124, 42, 69, 163, 168, 130, 234, 194];
    },
    {
      name: "voucher";
      discriminator: [118, 0, 134, 198, 175, 51, 19, 71];
    }
  ];
  errors: [
    {
      code: 6000;
      name: "assetOwnerMismatch";
      msg: "Asset Owner Does not match";
    },
    {
      code: 6001;
      name: "publicKeyMismatch";
      msg: "publicKeyMismatch";
    },
    {
      code: 6002;
      name: "hashingMismatch";
      msg: "Hashing Mismatch Within Leaf Schema";
    },
    {
      code: 6003;
      name: "unsupportedSchemaVersion";
      msg: "Unsupported Schema Version";
    },
    {
      code: 6004;
      name: "creatorShareTotalMustBe100";
      msg: "Creator shares must sum to 100";
    },
    {
      code: 6005;
      name: "duplicateCreatorAddress";
      msg: "No duplicate creator addresses in metadata";
    },
    {
      code: 6006;
      name: "creatorDidNotVerify";
      msg: "Creator did not verify the metadata";
    },
    {
      code: 6007;
      name: "creatorNotFound";
      msg: "Creator not found in creator Vec";
    },
    {
      code: 6008;
      name: "noCreatorsPresent";
      msg: "No creators in creator Vec";
    },
    {
      code: 6009;
      name: "creatorHashMismatch";
      msg: "User-provided creator Vec must result in same user-provided creator hash";
    },
    {
      code: 6010;
      name: "dataHashMismatch";
      msg: "User-provided metadata must result in same user-provided data hash";
    },
    {
      code: 6011;
      name: "creatorsTooLong";
      msg: "Creators list too long";
    },
    {
      code: 6012;
      name: "metadataNameTooLong";
      msg: "Name in metadata is too long";
    },
    {
      code: 6013;
      name: "metadataSymbolTooLong";
      msg: "Symbol in metadata is too long";
    },
    {
      code: 6014;
      name: "metadataUriTooLong";
      msg: "Uri in metadata is too long";
    },
    {
      code: 6015;
      name: "metadataBasisPointsTooHigh";
      msg: "Basis points in metadata cannot exceed 10000";
    },
    {
      code: 6016;
      name: "treeAuthorityIncorrect";
      msg: "Tree creator or tree delegate must sign.";
    },
    {
      code: 6017;
      name: "insufficientMintCapacity";
      msg: "Not enough unapproved mints left";
    },
    {
      code: 6018;
      name: "numericalOverflowError";
      msg: "numericalOverflowError";
    },
    {
      code: 6019;
      name: "incorrectOwner";
      msg: "Incorrect account owner";
    },
    {
      code: 6020;
      name: "collectionCannotBeVerifiedInThisInstruction";
      msg: "Cannot Verify Collection in this Instruction";
    },
    {
      code: 6021;
      name: "collectionNotFound";
      msg: "Collection Not Found on Metadata";
    },
    {
      code: 6022;
      name: "alreadyVerified";
      msg: "Collection item is already verified.";
    },
    {
      code: 6023;
      name: "alreadyUnverified";
      msg: "Collection item is already unverified.";
    },
    {
      code: 6024;
      name: "updateAuthorityIncorrect";
      msg: "Incorrect leaf metadata update authority.";
    },
    {
      code: 6025;
      name: "leafAuthorityMustSign";
      msg: "This transaction must be signed by either the leaf owner or leaf delegate";
    }
  ];
  types: [
    {
      name: "creator";
      type: {
        kind: "struct";
        fields: [
          {
            name: "address";
            type: "pubkey";
          },
          {
            name: "verified";
            type: "bool";
          },
          {
            name: "share";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "uses";
      type: {
        kind: "struct";
        fields: [
          {
            name: "useMethod";
            type: {
              defined: {
                name: "useMethod";
              };
            };
          },
          {
            name: "remaining";
            type: "u64";
          },
          {
            name: "total";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "collection";
      type: {
        kind: "struct";
        fields: [
          {
            name: "verified";
            type: "bool";
          },
          {
            name: "key";
            type: "pubkey";
          }
        ];
      };
    },
    {
      name: "metadataArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "name";
            docs: ["The name of the asset"];
            type: "string";
          },
          {
            name: "symbol";
            docs: ["The symbol for the asset"];
            type: "string";
          },
          {
            name: "uri";
            docs: ["URI pointing to JSON representing the asset"];
            type: "string";
          },
          {
            name: "sellerFeeBasisPoints";
            docs: [
              "Royalty basis points that goes to creators in secondary sales (0-10000)"
            ];
            type: "u16";
          },
          {
            name: "primarySaleHappened";
            type: "bool";
          },
          {
            name: "isMutable";
            type: "bool";
          },
          {
            name: "editionNonce";
            docs: ["nonce for easy calculation of editions, if present"];
            type: {
              option: "u8";
            };
          },
          {
            name: "tokenStandard";
            docs: [
              "Since we cannot easily change Metadata, we add the new DataV2 fields here at the end."
            ];
            type: {
              option: {
                defined: {
                  name: "tokenStandard";
                };
              };
            };
          },
          {
            name: "collection";
            docs: ["collection"];
            type: {
              option: {
                defined: {
                  name: "collection";
                };
              };
            };
          },
          {
            name: "uses";
            docs: ["uses"];
            type: {
              option: {
                defined: {
                  name: "uses";
                };
              };
            };
          },
          {
            name: "tokenProgramVersion";
            type: {
              defined: {
                name: "tokenProgramVersion";
              };
            };
          },
          {
            name: "creators";
            type: {
              vec: {
                defined: {
                  name: "creator";
                };
              };
            };
          }
        ];
      };
    },
    {
      name: "version";
      type: {
        kind: "enum";
        variants: [
          {
            name: "v1";
          }
        ];
      };
    },
    {
      name: "leafSchema";
      type: {
        kind: "enum";
        variants: [
          {
            name: "v1";
            fields: [
              {
                name: "id";
                type: "pubkey";
              },
              {
                name: "owner";
                type: "pubkey";
              },
              {
                name: "delegate";
                type: "pubkey";
              },
              {
                name: "nonce";
                type: "u64";
              },
              {
                name: "dataHash";
                type: {
                  array: ["u8", 32];
                };
              },
              {
                name: "creatorHash";
                type: {
                  array: ["u8", 32];
                };
              }
            ];
          }
        ];
      };
    },
    {
      name: "tokenProgramVersion";
      type: {
        kind: "enum";
        variants: [
          {
            name: "original";
          },
          {
            name: "token2022";
          }
        ];
      };
    },
    {
      name: "tokenStandard";
      type: {
        kind: "enum";
        variants: [
          {
            name: "nonFungible";
          },
          {
            name: "fungibleAsset";
          },
          {
            name: "fungible";
          },
          {
            name: "nonFungibleEdition";
          }
        ];
      };
    },
    {
      name: "useMethod";
      type: {
        kind: "enum";
        variants: [
          {
            name: "burn";
          },
          {
            name: "multiple";
          },
          {
            name: "single";
          }
        ];
      };
    },
    {
      name: "bubblegumEventType";
      type: {
        kind: "enum";
        variants: [
          {
            name: "uninitialized";
          },
          {
            name: "leafSchemaEvent";
          }
        ];
      };
    },
    {
      name: "instructionName";
      type: {
        kind: "enum";
        variants: [
          {
            name: "unknown";
          },
          {
            name: "mintV1";
          },
          {
            name: "redeem";
          },
          {
            name: "cancelRedeem";
          },
          {
            name: "transfer";
          },
          {
            name: "delegate";
          },
          {
            name: "decompressV1";
          },
          {
            name: "compress";
          },
          {
            name: "burn";
          },
          {
            name: "createTree";
          },
          {
            name: "verifyCreator";
          },
          {
            name: "unverifyCreator";
          },
          {
            name: "verifyCollection";
          },
          {
            name: "unverifyCollection";
          },
          {
            name: "setAndVerifyCollection";
          }
        ];
      };
    },
    {
      name: "treeConfig";
      type: {
        kind: "struct";
        fields: [
          {
            name: "treeCreator";
            type: "pubkey";
          },
          {
            name: "treeDelegate";
            type: "pubkey";
          },
          {
            name: "totalMintCapacity";
            type: "u64";
          },
          {
            name: "numMinted";
            type: "u64";
          },
          {
            name: "isPublic";
            type: "bool";
          }
        ];
      };
    },
    {
      name: "voucher";
      type: {
        kind: "struct";
        fields: [
          {
            name: "leafSchema";
            type: {
              defined: {
                name: "leafSchema";
              };
            };
          },
          {
            name: "index";
            type: "u32";
          },
          {
            name: "merkleTree";
            type: "pubkey";
          }
        ];
      };
    }
  ];
};

export const IDL = {
  address: "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY",
  metadata: {
    name: "bubblegum",
    version: "0.3.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "create_tree",
      discriminator: [165, 83, 136, 142, 89, 202, 47, 220],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
      name: "set_tree_delegate",
      discriminator: [253, 118, 66, 37, 190, 49, 154, 102],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
          relations: ["tree_creator"],
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
      name: "mint_v1",
      discriminator: [145, 98, 192, 118, 184, 147, 118, 104],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
    },
    {
      name: "mint_to_collection_v1",
      discriminator: [153, 18, 178, 47, 197, 158, 86, 15],
      accounts: [
        {
          name: "tree_authority",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  34, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 95, 99,
                  112, 105, 34,
                ],
              },
            ],
          },
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
    },
    {
      name: "verify_creator",
      discriminator: [52, 17, 96, 132, 71, 4, 85, 194],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
      name: "unverify_creator",
      discriminator: [107, 178, 57, 39, 105, 115, 112, 152],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
      discriminator: [56, 113, 101, 253, 79, 55, 122, 169],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  34, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 95, 99,
                  112, 105, 34,
                ],
              },
            ],
          },
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
      name: "unverify_collection",
      discriminator: [250, 251, 42, 106, 41, 137, 186, 168],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  34, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 95, 99,
                  112, 105, 34,
                ],
              },
            ],
          },
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
      name: "set_and_verify_collection",
      discriminator: [235, 242, 121, 216, 158, 234, 180, 234],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  34, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 95, 99,
                  112, 105, 34,
                ],
              },
            ],
          },
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
      name: "transfer",
      discriminator: [163, 52, 200, 231, 140, 3, 69, 186],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
      name: "delegate",
      discriminator: [90, 147, 75, 178, 85, 88, 4, 137],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
      name: "burn",
      discriminator: [116, 110, 29, 56, 107, 219, 42, 93],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
      name: "redeem",
      discriminator: [184, 12, 86, 149, 70, 196, 97, 225],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
          pda: {
            seeds: [
              {
                kind: "const",
                value: [34, 118, 111, 117, 99, 104, 101, 114, 34],
              },
              {
                kind: "account",
                path: "merkle_tree",
              },
              {
                kind: "arg",
                path: "nonce",
              },
            ],
          },
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
      discriminator: [111, 76, 232, 50, 39, 175, 48, 242],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
          pda: {
            seeds: [
              {
                kind: "const",
                value: [34, 118, 111, 117, 99, 104, 101, 114, 34],
              },
              {
                kind: "account",
                path: "merkle_tree",
              },
              {
                kind: "account",
                path: "voucher.leaf_schema",
                account: "Voucher",
              },
            ],
          },
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
      name: "decompress_v1",
      discriminator: [54, 85, 76, 70, 228, 250, 164, 81],
      accounts: [
        {
          name: "voucher",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [34, 118, 111, 117, 99, 104, 101, 114, 34],
              },
              {
                kind: "account",
                path: "voucher.merkle_tree",
                account: "Voucher",
              },
              {
                kind: "account",
                path: "voucher.leaf_schema",
                account: "Voucher",
              },
            ],
          },
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
          pda: {
            seeds: [
              {
                kind: "const",
                value: [34, 97, 115, 115, 101, 116, 34],
              },
              {
                kind: "account",
                path: "voucher.merkle_tree",
                account: "Voucher",
              },
              {
                kind: "account",
                path: "voucher.leaf_schema",
                account: "Voucher",
              },
            ],
          },
        },
        {
          name: "mint_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "mint",
              },
            ],
          },
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
      name: "compress",
      discriminator: [82, 193, 176, 117, 176, 21, 115, 253],
      accounts: [
        {
          name: "tree_authority",
          pda: {
            seeds: [
              {
                kind: "account",
                path: "merkle_tree",
              },
            ],
          },
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
  ],
  accounts: [
    {
      name: "treeConfig",
      discriminator: [124, 42, 69, 163, 168, 130, 234, 194],
    },
    {
      name: "voucher",
      discriminator: [118, 0, 134, 198, 175, 51, 19, 71],
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
        ],
      },
    },
    {
      name: "treeConfig",
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
        ],
      },
    },
    {
      name: "voucher",
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
