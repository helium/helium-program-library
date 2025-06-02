import { Transaction } from "sequelize";

type Plugins = "ExtractHexLocation" | "EncodeEntityKey";
type Crons = "refresh-accounts" | "integrity-check";

export interface IPluginConfig {
  type: Plugins;
  config: any;
}

export type IxSideEffectAction = "delete";
export interface IIxSideEffect {
  ix: string;
  acc: string;
  action: IxSideEffectAction;
}

export interface IAccountConfig {
  type: string;
  table: string;
  schema: string;
  batchSize: number;
  plugins?: IPluginConfig[];
  ix_side_effects?: IIxSideEffect[];
  ignore_deletes?: boolean;
}

export interface IConfig {
  programId: string;
  accounts: IAccountConfig[];
  crons?: { type: Crons; schedule: string }[];
}

export interface IInitedPlugin {
  updateOnDuplicateFields?: string[];
  addFields?: (schema: { [key: string]: any }, accountName: string) => void;
  addIndexes?: (schema: { [key: string]: any }, accountName: string) => void;
  processAccount: (account: any, t?: Transaction) => Promise<any>;
}

export interface IPlugin {
  name: Plugins;
  init: (config: { [key: string]: any }) => Promise<IInitedPlugin>;
}
