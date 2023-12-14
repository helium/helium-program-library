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

export class Proposal extends Model {
  declare address: string;
  declare namespace: string;
  declare owner: string;
  declare state: object;
  declare createdAt: number;
  declare proposalConfig: string;
  declare maxChoicesPerVoter: number;
  declare seed: Buffer;
  declare name: string;
  declare uri: string;
  declare tags: string[];
  declare choices: object[];
  declare bumpSeed: number;
  declare refreshedAt: Date;
}

Proposal.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    namespace: DataTypes.STRING,
    owner: DataTypes.STRING,
    state: DataTypes.JSONB,
    createdAt: DataTypes.DECIMAL,
    proposalConfig: DataTypes.STRING,
    maxChoicesPerVoter: DataTypes.INTEGER,
    seed: DataTypes.BLOB,
    name: DataTypes.STRING,
    uri: DataTypes.STRING,
    tags: DataTypes.ARRAY(DataTypes.STRING),
    choices: DataTypes.ARRAY(DataTypes.JSONB),
    bumpSeed: DataTypes.INTEGER,
    refreshedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "proposal",
    tableName: "proposals",
    underscored: true,
    timestamps: false,
  }
);

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
    indexes: [
      {
        fields: ["voter"],
      },
      {
        fields: ["proposal"],
      },
    ],
  }
);

export class Registrar extends Model {
  declare address: string;
  declare governanceProgramId: string;
  declare realm: string;
  declare realmGoverningTokenMint: string;
  declare realmAuthority: string;
  declare votingMints: {
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
    governanceProgramId: DataTypes.STRING,
    realm: DataTypes.STRING,
    realmGoverningTokenMint: DataTypes.STRING,
    realmAuthority: DataTypes.STRING,
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
  declare asset: string;
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
    asset: DataTypes.STRING,
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
  declare delegationConfig: string
  declare rentRefund: string;
  declare bumpSeed: number;
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
    delegationConfig: DataTypes.STRING,
    rentRefund: DataTypes.STRING,
    bumpSeed: DataTypes.INTEGER,
    expirationTime: DataTypes.DECIMAL.UNSIGNED
  },
  {
    sequelize,
    modelName: "delegation",
    tableName: "delegations",
    underscored: true,
    timestamps: false,
  }
);


export function setRelations() {
  Delegation.belongsTo(Position, { foreignKey: "asset", targetKey: "asset" });
  Position.hasMany(Delegation, { foreignKey: "asset", sourceKey: "asset" });
  Proxy.hasMany(Delegation, { foreignKey: "owner", sourceKey: "wallet" });
  ProxyRegistrar.hasMany(Proxy, { foreignKey: "wallet", sourceKey: "wallet" });
  Proxy.hasMany(ProxyRegistrar, { foreignKey: "wallet", sourceKey: "wallet" });
}
