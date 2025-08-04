import BN from "bn.js";
import { cellToLatLng } from "h3-js";
import { camelize } from "inflection";
import _omit from "lodash/omit";
import { DataTypes, Model, QueryTypes } from "sequelize";
import { IPlugin } from "../types";
import { database } from "../utils/database";
import { MapboxService } from "../utils/mapboxService";
import { PublicKey } from "@solana/web3.js";

export class RewardsRecipient extends Model {
  declare asset: string;
  // For fanouts, the owner and delegate/destination may be different.
  declare owner: string;
  // For convenience, we set this to owner if no delegate/destination is set.
  declare destination: string;
  declare entityKey: string;
  declare encodedEntityKey: string;
  declare shares: number
  declare totalShares: number
  declare fixedAmount: number
  declare type: 'direct' | 'fanout'
}

RewardsRecipient.init(
  {
    asset: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    owner: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    destination: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    entityKey: {
      type: "BYTEA",
      allowNull: false,
      field: "entity_key",
    },
    encodedEntityKey: {
      type: "TEXT",
      allowNull: true,
      field: "encoded_entity_key",
    },
    keySerialization: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    shares: {
      type: DataTypes.DECIMAL.UNSIGNED,
      primaryKey: true,
    },
    totalShares: {
      type: DataTypes.DECIMAL.UNSIGNED,
      primaryKey: true,
    },
    fixedAmount: {
      type: DataTypes.DECIMAL.UNSIGNED,
      primaryKey: true,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: database,
    modelName: "rewards_recipients",
    tableName: "rewards_recipients",
    underscored: true,
    timestamps: true,
    indexes: [
      {
        fields: ["asset"],
      },
      {
        fields: ["destination"],
      },
      {
        fields: ["owner"],
      },
      {
        fields: ["type"],
      },
    ],
  }
);

type MiniFanoutShare = {
  wallet: string,
  delegate: string,
  share: Share,
  totalDust: number,
  totalOwed: number,
}

type Share = {
  share?: { amount: number },
  fixed?: { amount: number },
}

export class Recipient extends Model {
  declare address: string
  declare asset: string
  declare destination: string
  declare lazyDistributor: string
}

Recipient.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    asset: {
      type: DataTypes.STRING,
    },
    destination: {
      type: DataTypes.STRING,
    },
    lazyDistributor: {
      type: DataTypes.STRING,
    },
  },
  {
    sequelize: database,
    modelName: "recipients",
    tableName: "recipients",
    underscored: true,
    timestamps: false,
  }
)

export class KeyToAsset extends Model {
  declare address: string
  declare asset: string
  declare dao: string
  declare entityKey: Buffer
  declare keySerialization: string
  declare encodedEntityKey: string
}

KeyToAsset.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    asset: {
      type: DataTypes.STRING,
    },
    dao: {
      type: DataTypes.STRING,
    },
    keySerialization: {
      type: DataTypes.STRING,
    },
    entityKey: {
      type: "BYTEA",
      allowNull: false,
      field: "entity_key",
    },
    encodedEntityKey: {
      type: "TEXT",
      allowNull: true,
      field: "encoded_entity_key",
    },
  },
  {
    sequelize: database,
    modelName: "key_to_assets",
    tableName: "key_to_assets",
    underscored: true,
    timestamps: false,
  }
)

export class MiniFanout extends Model {
  declare owner: string;
  declare namespace: string;
  declare mint: string;
  declare tokenAccount: string;
  declare taskQueue: string;
  declare nextTask: string;
  declare rentRefund: string;
  declare bump: number;
  declare schedule: string;
  declare queueAuthorityBump: number;
  declare shares: MiniFanoutShare[];
  declare seed: string;
  declare nextPreTask: string;
  declare preTask: string;
  declare refreshedAt: Date;
  declare createdAt: Date;
}

MiniFanout.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    owner: {
      type: DataTypes.STRING,
    },
    namespace: {
      type: DataTypes.STRING,
    },
    mint: {
      type: DataTypes.STRING,
    },
    tokenAccount: {
      type: DataTypes.STRING,
    },
    taskQueue: {
      type: DataTypes.STRING,
    },
    nextTask: {
      type: DataTypes.STRING,
    },
    rentRefund: {
      type: DataTypes.STRING,
    },
    bump: {
      type: DataTypes.INTEGER,
    },
    schedule: {
      type: DataTypes.STRING,
    },
    queueAuthorityBump: {
      type: DataTypes.INTEGER,
    },
    shares: {
      type: DataTypes.JSONB,
    },
    seed: {
      type: DataTypes.BLOB,
    },
    nextPreTask: {
      type: DataTypes.STRING,
    },
    preTask: {
      type: DataTypes.JSONB,
    },
    refreshedAt: {
      type: DataTypes.DATE,
    },
    createdAt: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize: database,
    modelName: "mini_fanouts",
    tableName: "mini_fanouts",
    underscored: true,
    timestamps: false,
  }
);

export const HNT_LAZY_DISTRIBUTOR = "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq"

export async function handleMiniFanout(asset: string, account: { [key: string]: any }, transaction: any) {
  const prevAccount = await MiniFanout.findByPk(account.address)
  const oldShares = prevAccount?.shares || []
  const newShares = (account.shares || []) as MiniFanoutShare[]

  function getEffectiveDestination(share: MiniFanoutShare) {
    return (!share.delegate || share.delegate === PublicKey.default.toBase58()) ? share.wallet : share.delegate
  }

  function getShareKey(share: MiniFanoutShare) {
    return `${asset}-${getEffectiveDestination(share)}-${JSON.stringify(share.share)}`
  }
  // Create a map of wallet+delegate to share for easy lookup
  const oldSharesMap = new Map(
    oldShares.map(share => [getShareKey(share), share])
  )
  const newSharesMap = new Map(
    newShares.map(share => [getShareKey(share), share])
  )

  const totalShares = newShares.reduce((acc, share) => acc + (share.share?.share?.amount || 0), 0)

  // Handle deletions - remove shares that exist in old but not in new
  for (const [key, oldShare] of oldSharesMap) {
    if (!newSharesMap.has(key)) {
      await RewardsRecipient.destroy({
        where: {
          destination: getEffectiveDestination(oldShare),
          asset,
          shares: oldShare.share?.share?.amount || 0,
        },
        transaction
      })
    }
  }

  // Handle updates and additions
  for (const [key, newShare] of newSharesMap) {
    const oldShare = oldSharesMap.get(key)

    const kta = await KeyToAsset.findOne({
      where: {
        dao: 'BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie',
        asset: asset,
      }
    })

    const toCreate = {
      asset,
      owner: newShare.wallet,
      destination: getEffectiveDestination(newShare),
      shares: newShare.share?.share?.amount || 0,
      fixedAmount: newShare.share?.fixed?.amount || 0,
      totalShares,
      entityKey: kta?.entityKey,
      encodedEntityKey: kta?.encodedEntityKey,
      keySerialization: kta?.keySerialization,
      type: 'fanout'
    }

    // If share exists, update it if changed
    if (oldShare) {
      const hasChanged =
        JSON.stringify(oldShare.share) !== JSON.stringify(newShare.share)

      if (hasChanged) {
        await RewardsRecipient.upsert(toCreate, { transaction })
      }
    }
    // If share is new, add it
    else {
      await RewardsRecipient.create(toCreate, { transaction })
    }
  }

  return account
}

export const ExplodeMiniFanoutOwnershipPlugin = ((): IPlugin => {
  const name = "ExplodeMiniFanoutOwnership";
  const init = async (config: { [key: string]: any }) => {
    const updateOnDuplicateFields: string[] = [];

    const existingColumns = (
      await database.query(
        `
        SELECT column_name
          FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rewards_recipients'
      `,
        { type: QueryTypes.SELECT }
      )
    ).map((x: any) => camelize(x.column_name, true));
    const columns = Object.keys(RewardsRecipient.getAttributes()).map((att) =>
      camelize(att, true)
    );

    if (
      !existingColumns.length ||
      !columns.every((col) => existingColumns.includes(col))
    ) {
      await RewardsRecipient.sync({ alter: true });
    }

    const addFields = () => { };

    const processAccount = async (
      account: { [key: string]: any },
      transaction?: any
    ) => {
      try {
        const asset = account.preTask?.remoteV0?.url?.replace("https://hnt-rewards.oracle.helium.io/v1/tuktuk/asset/", "").replace("https://hnt-rewards.oracle.test-helium.com/v1/tuktuk/asset/", "")
        if (!asset) {
          return account
        }
        const recipient = await Recipient.findOne({
          where: {
            destination: account.address,
            asset,
            lazyDistributor: HNT_LAZY_DISTRIBUTOR
          }
        })
        if (!recipient) {
          return account
        }
        return handleMiniFanout(asset, account, transaction)
      } catch (err) {
        console.error("Error exploding mini fanout ownership", err)
        throw err
      }
    };

    return {
      updateOnDuplicateFields,
      addFields,
      processAccount,
    };
  };

  return {
    name,
    init,
  };
})();
