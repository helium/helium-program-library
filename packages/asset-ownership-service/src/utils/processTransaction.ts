import {
  PublicKey,
  Transaction as SolanaTransaction,
  VersionedTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  PROGRAM_ID as HEM_PROGRAM_ID,
  init as initHem,
} from "@helium/helium-entity-manager-sdk";
import { PROGRAM_ID as MEM_PROGRAM_ID } from "@helium/mobile-entity-manager-sdk";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { BubblegumIdl } from "../bubblegum";
import { AssetOwner } from "./database";
import { PG_CARRIER_TABLE, PG_DATA_ONLY_TABLE, PG_MAKER_TABLE } from "../env";
import { QueryTypes, Transaction } from "sequelize";
import database from "./database";
import { provider } from "./solana";

interface TreeConfig {
  accountKey: string;
  tableName: string;
  merkleTrees: Set<string>;
}

interface TreeConfigs {
  [key: string]: TreeConfig;
}

interface ProcessableInstruction {
  programIdIndex: number;
  accountKeyIndexes: number[];
  data: Buffer | Uint8Array;
}

interface ProcessableTransaction {
  accountKeys: PublicKey[];
  instructions: ProcessableInstruction[];
  innerInstructions?: {
    index: number;
    instructions: ProcessableInstruction[];
  }[];
}

export class TransactionProcessor {
  private readonly hemProgram: Awaited<ReturnType<typeof initHem>>;
  private readonly coders: {
    [programId: string]: anchor.BorshInstructionCoder;
  };
  private readonly treeConfigs: TreeConfigs;
  private readonly transaction: Transaction;

  private constructor(
    hemProgram: Awaited<ReturnType<typeof initHem>>,
    coders: { [programId: string]: anchor.BorshInstructionCoder },
    treeConfigs: TreeConfigs,
    transaction: Transaction
  ) {
    this.hemProgram = hemProgram;
    this.coders = coders;
    this.treeConfigs = treeConfigs;
    this.transaction = transaction;
  }

  static async create(
    makerTrees: Set<string>,
    carrierTrees: Set<string>,
    dataOnlyTrees: Set<string>
  ): Promise<TransactionProcessor> {
    const hemProgram = await initHem(provider);
    const coders = {
      [HEM_PROGRAM_ID.toBase58()]: new anchor.BorshInstructionCoder(
        await fetchBackwardsCompatibleIdl(HEM_PROGRAM_ID, provider)
      ),
      [MEM_PROGRAM_ID.toBase58()]: new anchor.BorshInstructionCoder(
        await fetchBackwardsCompatibleIdl(MEM_PROGRAM_ID, provider)
      ),
      [BUBBLEGUM_PROGRAM_ID.toBase58()]: new anchor.BorshInstructionCoder(
        BubblegumIdl
      ),
    };

    const treeConfigs: TreeConfigs = {
      update_maker_tree_v0: {
        accountKey: "Maker",
        tableName: PG_MAKER_TABLE!,
        merkleTrees: makerTrees,
      },
      update_carrier_tree_v0: {
        accountKey: "Carrier",
        tableName: PG_CARRIER_TABLE!,
        merkleTrees: carrierTrees,
      },
      update_data_only_tree_v0: {
        accountKey: "Data_only_config",
        tableName: PG_DATA_ONLY_TABLE!,
        merkleTrees: dataOnlyTrees,
      },
    };

    return new TransactionProcessor(
      hemProgram,
      coders,
      treeConfigs,
      await database.transaction()
    );
  }

  private async processInstruction(
    instruction: ProcessableInstruction,
    tx: ProcessableTransaction
  ) {
    const programId = new PublicKey(tx.accountKeys[instruction.programIdIndex]);
    const instructionCoder = this.coders[programId.toBase58()];

    if (!instructionCoder) return;

    const decodedInstruction = instructionCoder.decode(
      Buffer.from(instruction.data)
    );

    if (!decodedInstruction) return;

    const formattedInstruction = instructionCoder.format(
      decodedInstruction,
      instruction.accountKeyIndexes.map((idx) => ({
        pubkey: new PublicKey(tx.accountKeys[idx]),
        isSigner: false, // These will be set correctly by the caller
        isWritable: false, // These will be set correctly by the caller
      }))
    );

    if (!formattedInstruction) return;

    const accountMap = Object.fromEntries(
      (formattedInstruction.accounts || []).map((acc) => [acc.name, acc])
    );

    const argMap = Object.fromEntries(
      (formattedInstruction.args || []).map((arg) => [arg.name, arg])
    );

    switch (decodedInstruction.name) {
      case "update_maker_tree_v0":
      case "update_carrier_tree_v0":
      case "update_data_only_tree_v0": {
        const config = this.treeConfigs[decodedInstruction.name];
        if (!config) return;

        const entityAccount = accountMap[config.accountKey]?.pubkey;
        const newTreeAccount = accountMap["New_merkle_tree"]?.pubkey;

        if (
          entityAccount &&
          newTreeAccount &&
          config.merkleTrees &&
          !config.merkleTrees.has(newTreeAccount)
        ) {
          await database.query(
            `INSERT INTO ${config.tableName} (address, merkle_tree)
             VALUES (:address, :merkle_tree)
             ON CONFLICT (address) DO UPDATE SET merkle_tree = EXCLUDED.merkle_tree;`,
            {
              replacements: {
                address: entityAccount.toBase58(),
                merkle_tree: newTreeAccount.toBase58(),
              },
              type: QueryTypes.INSERT,
              transaction: this.transaction,
            }
          );

          config.merkleTrees.add(newTreeAccount);
        }
        break;
      }

      case "issue_entity_v0":
      case "issue_data_only_entity_v0":
      case "initialize_subscriber_v0": {
        const recipientAccount = accountMap["Recipient"]?.pubkey;
        const keyToAssetAccount = accountMap["Key_to_asset"]?.pubkey;

        if (recipientAccount && keyToAssetAccount) {
          const keyToAsset = await this.hemProgram.account.keyToAssetV0.fetch(
            keyToAssetAccount
          );

          if (keyToAsset) {
            await AssetOwner.upsert(
              {
                asset: keyToAsset.asset.toBase58(),
                owner: recipientAccount.toBase58(),
              },
              { transaction: this.transaction }
            );
          }
        }
        break;
      }

      case "transfer": {
        const newOwnerAccount = accountMap["New_leaf_owner"]?.pubkey;
        const merkleTreeAccount = accountMap["Merkle_tree"]?.pubkey;
        const nonceArg = argMap["nonce"]?.data;

        if (newOwnerAccount && merkleTreeAccount && nonceArg) {
          const nonceBuffer = Buffer.alloc(8);
          nonceBuffer.writeBigUInt64LE(BigInt(nonceArg));

          const seeds = [
            Buffer.from("asset", "utf-8"),
            merkleTreeAccount.toBuffer(),
            nonceBuffer,
          ];

          const [assetId] = PublicKey.findProgramAddressSync(
            seeds,
            BUBBLEGUM_PROGRAM_ID
          );

          await AssetOwner.upsert(
            {
              asset: assetId.toBase58(),
              owner: newOwnerAccount.toBase58(),
            },
            { transaction: this.transaction }
          );
        }
        break;
      }
    }
  }

  async processTransaction(tx: ProcessableTransaction) {
    // Process main instructions
    for (const instruction of tx.instructions) {
      await this.processInstruction(instruction, tx);
    }

    // Process inner instructions
    if (tx.innerInstructions) {
      for (const innerSet of tx.innerInstructions) {
        for (const instruction of innerSet.instructions) {
          await this.processInstruction(instruction, tx);
        }
      }
    }
  }

  async commit() {
    await this.transaction.commit();
  }

  async rollback() {
    await this.transaction.rollback();
  }
}
