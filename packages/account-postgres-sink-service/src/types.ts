type Plugins = 'ExtractHexLocation';
type Crons = 'refresh-accounts' | 'integrity-check';

export interface IPluginConfig {
  type: Plugins;
  config: any;
}

export interface IAccountConfig {
  type: string;
  table: string;
  schema: string;
  batchSize: number;
  plugins?: IPluginConfig[];
}

export interface IConfig {
  programId: string;
  accounts: IAccountConfig[];
  crons?: { type: Crons; schedule: string }[];
}

export interface IInitedPlugin {
  updateOnDuplicateFields?: string[];
  addFields?: (schema: { [key: string]: any }, accountName: string) => void;
  processAccount: (account: any) => Promise<any>;
}

export interface IPlugin {
  name: Plugins;
  init: (config: { [key: string]: any }) => Promise<IInitedPlugin>;
}
