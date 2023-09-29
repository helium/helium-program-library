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
  plugins?: IPluginConfig[];
}

export interface IConfig {
  programId: string;
  accounts: IAccountConfig[];
  crons?: { type: Crons; schedule: string }[];
}

export interface IPlugin {
  name: Plugins;
  init: (config: { [key: string]: any }) => Promise<{
    updateOnDuplicateFields?: string[];
    addFields?: (schema: { [key: string]: any }, accountName: string) => void;
    processAccount: (account: any) => Promise<any>;
  }>;
}
