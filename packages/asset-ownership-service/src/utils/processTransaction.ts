import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  PROGRAM_ID as HEM_PROGRAM_ID,
  init as initHem,
} from "@helium/helium-entity-manager-sdk";
import { PROGRAM_ID as MEM_PROGRAM_ID } from "@helium/mobile-entity-manager-sdk";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { BubblegumIdl } from "../bubblegum";
import { PG_CARRIER_TABLE, PG_DATA_ONLY_TABLE, PG_MAKER_TABLE } from "../env";
import { QueryTypes, Transaction } from "sequelize";
import database, { AssetOwner } from "./database";
import { provider } from "./solana";
import retry from "async-retry";

interface TreeConfig {
  accountKey: string;
  tableName: string;
  merkleTrees: Set<string>;
}

interface TreeConfigs {
  [key: string]: TreeConfig;
}

export interface ProcessableInstruction {
  programIdIndex: number;
  accountKeyIndexes: number[];
  data: Buffer | Uint8Array;
}

export interface ProcessableTransaction {
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
  private treeConfigs: TreeConfigs;

  private constructor(
    hemProgram: Awaited<ReturnType<typeof initHem>>,
    coders: { [programId: string]: anchor.BorshInstructionCoder },
    treeConfigs: TreeConfigs
  ) {
    this.hemProgram = hemProgram;
    this.coders = coders;
    this.treeConfigs = treeConfigs;
  }

  getTrees(): Set<string> {
    return new Set([
      ...this.treeConfigs.update_maker_tree_v0.merkleTrees,
      ...this.treeConfigs.update_data_only_tree_v0.merkleTrees,
      ...this.treeConfigs.update_carrier_tree_v0.merkleTrees,
    ]);
  }

  private async getCurrentblock(): Promise<number> {
    return await retry(() => provider.connection.getSlot("finalized"), {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
    });
  }

  private static async getMerkleTreeSet(
    tableName: string
  ): Promise<Set<string>> {
    return new Set(
      (
        (await database.query(`SELECT merkle_tree FROM ${tableName};`, {
          type: QueryTypes.SELECT,
        })) as { merkle_tree: string }[]
      ).map((row) => row.merkle_tree)
    );
  }

  async refreshTrees(): Promise<void> {
    this.treeConfigs = {
      update_maker_tree_v0: {
        accountKey: "Maker",
        tableName: PG_MAKER_TABLE!,
        merkleTrees: await TransactionProcessor.getMerkleTreeSet(
          PG_MAKER_TABLE!
        ),
      },
      update_carrier_tree_v0: {
        accountKey: "Carrier",
        tableName: PG_CARRIER_TABLE!,
        merkleTrees: await TransactionProcessor.getMerkleTreeSet(
          PG_CARRIER_TABLE!
        ),
      },
      update_data_only_tree_v0: {
        accountKey: "Data_only_config",
        tableName: PG_DATA_ONLY_TABLE!,
        merkleTrees: await TransactionProcessor.getMerkleTreeSet(
          PG_DATA_ONLY_TABLE!
        ),
      },
    };
  }

  static async create(): Promise<TransactionProcessor> {
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

    const makerTrees = await TransactionProcessor.getMerkleTreeSet(
      PG_MAKER_TABLE!
    );
    const dataOnlyTrees = await TransactionProcessor.getMerkleTreeSet(
      PG_DATA_ONLY_TABLE!
    );
    const carrierTrees = await TransactionProcessor.getMerkleTreeSet(
      PG_CARRIER_TABLE!
    );

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

    return new TransactionProcessor(hemProgram, coders, treeConfigs);
  }

  private async processInstruction(
    instruction: ProcessableInstruction,
    tx: ProcessableTransaction,
    transaction: Transaction,
    block?: number
  ): Promise<{ updatedTrees: boolean }> {
    const programId = new PublicKey(tx.accountKeys[instruction.programIdIndex]);
    const instructionCoder = this.coders[programId.toBase58()];

    if (!instructionCoder) return { updatedTrees: false };

    const decodedInstruction = instructionCoder.decode(
      Buffer.from(instruction.data)
    );

    if (!decodedInstruction) return { updatedTrees: false };

    const formattedInstruction = instructionCoder.format(
      decodedInstruction,
      instruction.accountKeyIndexes.map((idx) => ({
        pubkey: new PublicKey(tx.accountKeys[idx]),
        isSigner: false,
        isWritable: false,
      }))
    );

    if (!formattedInstruction) return { updatedTrees: false };

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
        if (!config) return { updatedTrees: false };

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
              transaction,
            }
          );

          config.merkleTrees.add(newTreeAccount);
          return { updatedTrees: true };
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
            const lastBlock = block ?? (await this.getCurrentblock());
            await AssetOwner.upsert(
              {
                asset: keyToAsset.asset.toBase58(),
                owner: recipientAccount.toBase58(),
                lastBlock,
              },
              { transaction }
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

          const lastBlock = block ?? (await this.getCurrentblock());
          await AssetOwner.upsert(
            {
              asset: assetId.toBase58(),
              owner: newOwnerAccount.toBase58(),
              lastBlock,
            },
            { transaction }
          );
        }
        break;
      }
    }

    return { updatedTrees: false };
  }

  async processTransaction(
    tx: ProcessableTransaction,
    transaction: Transaction,
    block?: number
  ): Promise<{ updatedTrees: boolean }> {
    for (let i = 0; i < tx.instructions.length; i++) {
      const { updatedTrees } = await this.processInstruction(
        tx.instructions[i],
        tx,
        transaction,
        block
      );
      if (updatedTrees) {
        return { updatedTrees: true };
      }

      // Process inner instructions for this index before moving to the next
      // main instruction — matches Solana's actual execution order
      const innerSet = tx.innerInstructions?.find((s) => s.index === i);
      if (innerSet) {
        for (const innerIx of innerSet.instructions) {
          const result = await this.processInstruction(
            innerIx,
            tx,
            transaction,
            block
          );
          if (result.updatedTrees) {
            return { updatedTrees: true };
          }
        }
      }
    }

    return { updatedTrees: false };
  }
}
