import AWS from "aws-sdk";
import * as pg from "pg";
import { DataTypes, Model, Sequelize } from "sequelize";

const host = process.env.PGHOST || "localhost";
const port = Number(process.env.PGPORT) || 5432;
export const sequelize = new Sequelize({
  host: host,
  dialect: "postgres",
  port: port,
  logging: false,
  dialectModule: pg,
  username: process.env.PGUSER,
  database: process.env.PGDATABASE,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  hooks: {
    beforeConnect: async (config: any) => {
      const isRds = host.includes("rds.amazonaws.com");

      let password = process.env.PGPASSWORD;
      if (isRds && !password) {
        const signer = new AWS.RDS.Signer({
          region: process.env.AWS_REGION,
          hostname: process.env.PGHOST,
          port,
          username: process.env.PGUSER,
        });
        password = await new Promise((resolve, reject) =>
          signer.getAuthToken({}, (err, token) => {
            if (err) {
              return reject(err);
            }
            resolve(token);
          })
        );
        config.dialectOptions = {
          ssl: {
            require: false,
            rejectUnauthorized: false,
          },
        };
      }
      config.password = password;
    },
  },
});

export class VoteMarker extends Model {
  declare address: string;
  declare voter: string;
  declare registrar: string;
  declare proposal: string;
  declare mint: string;
  declare choices: number[];
  declare weight: string;
  declare delegationIndex: number;

  declare created_at: Date;
}
VoteMarker.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    voter: DataTypes.STRING,
    registrar: DataTypes.STRING,
    proposal: DataTypes.STRING,
    mint: DataTypes.STRING,
    choices: DataTypes.JSONB,
    weight: DataTypes.DECIMAL(38, 0).UNSIGNED,
    delegationIndex: DataTypes.INTEGER,
  },
  {
    sequelize,
    modelName: "vote_marker",
    tableName: "vote_markers",
    underscored: true,
    timestamps: false,
  }
);

export class Registrar extends Model {
  declare address: string;
  declare governance_program_id: string;
  declare realm: string;
  declare realm_governing_token_mint: string;
  declare realm_authority: string;
  declare voting_mints: {
    mint: string;
    baselineVoteWeightScaledFactor: string;
    maxExtraLockupVoteWeightScaledFactor: string;
    genesisVotePowerMultiplier: number;
    genesisVotePowerMultiplierExpiration: bigint;
    lockupSaturationSecs: string;
    digitShift: number;
  }[];
}
Registrar.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    governance_program_id: DataTypes.STRING,
    realm: DataTypes.STRING,
    realm_governing_token_mint: DataTypes.STRING,
    realm_authority: DataTypes.STRING,
    voting_mints: DataTypes.JSONB,
  },
  {
    sequelize,
    modelName: "registrar",
    tableName: "registrars",
    underscored: true,
    timestamps: false,
  }
);

export class Position extends Model {
  declare address: string;
  declare registrar: string;
  declare mint: string;
  declare lockup: {
    startTs: string;
    endTs: string;
    kind: "none" | "cliff" | "constant";
  };
  declare amountDepositedNative: string;
  declare votingMintConfigIdx: number;
  declare numActiveVotes: number;
  declare genesisEnd: bigint;
  declare voteController: string;
}
Position.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    registrar: DataTypes.STRING,
    mint: DataTypes.STRING,
    lockup: DataTypes.JSONB,
    amountDepositedNative: DataTypes.DECIMAL.UNSIGNED,
    votingMintConfigIdx: DataTypes.INTEGER,
    numActiveVotes: DataTypes.INTEGER,
    genesisEnd: DataTypes.BIGINT,
    voteController: DataTypes.STRING,
    veTokens: DataTypes.BIGINT.UNSIGNED,
  },
  {
    sequelize,
    modelName: "position",
    tableName: "positions_with_vetokens",
    underscored: true,
    timestamps: false,
  }
);

export class Proxy extends Model {
  declare name: string;
  declare image: string;
  declare wallet: string;
  declare description: string;
  declare detail: string;
}
Proxy.init(
  {
    name: {
      type: DataTypes.STRING,
      unique: true
    },
    image: DataTypes.STRING,
    wallet: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    description: DataTypes.STRING,
    detail: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "proxy",
    tableName: "proxies",
    underscored: true,
    timestamps: true,
  }
);

export class ProxyRegistrar extends Model {
  declare registrar: string;
  declare wallet: string;
}
ProxyRegistrar.init(
  {
    registrar: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    wallet: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "proxy_registrar",
    tableName: "proxy_registrars",
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["registrar", "wallet"], // Add composite index for registrar and wallet
      },
      {
        fields: ["registrar"],
      },
      {
        fields: ["wallet"],
      },
    ],
  }
);

export class Delegation extends Model {
  declare address: string;
  declare owner: string;
  declare nextOwner: string;
  declare index: number;
  declare asset: string;
}
Delegation.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    owner: DataTypes.STRING,
    nextOwner: DataTypes.STRING,
    index: DataTypes.INTEGER,
    asset: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "delegation",
    tableName: "delegations",
    underscored: true,
    timestamps: false,
  }
);

Delegation.belongsTo(Position, { foreignKey: "asset", targetKey: "mint" });
Position.hasMany(Delegation, { foreignKey: "asset", sourceKey: "mint" });
Proxy.hasMany(Delegation, { foreignKey: "owner", sourceKey: "wallet" });
ProxyRegistrar.hasMany(Proxy, { foreignKey: "wallet", sourceKey: "wallet" })
Proxy.hasMany(ProxyRegistrar, { foreignKey: "wallet", sourceKey: "wallet" });
