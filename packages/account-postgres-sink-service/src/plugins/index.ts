import { IConfig, IInitedPlugin, IPluginConfig } from "../types";
import { truthy } from "../utils/truthy";
import { ExtractHexLocationPlugin } from "./extractHexLocation";
import { EncodeEntityKeyPlugin } from "./encodeEntityKey";
import { ExplodeMiniFanoutOwnershipPlugin } from "./explodeMiniFanoutOwnership";
import { ExplodeRecipientDestinationOwnershipPlugin } from "./explodeRecipientDestinationOwnership";

export const Plugins = [ExtractHexLocationPlugin, EncodeEntityKeyPlugin, ExplodeMiniFanoutOwnershipPlugin, ExplodeRecipientDestinationOwnershipPlugin];

export const initPlugins = async (pluginConfigs: IPluginConfig[] = []) =>
  (
    await Promise.all(
      pluginConfigs.map(async ({ type, config }) => {
        const plugin = Plugins.find(({ name }) => type === name);
        if (plugin) return plugin.init(config);
      })
    )
  ).filter(Boolean);

export const getPluginsByAccountTypeByProgram = async (
  configs: IConfig[]
): Promise<Record<string, Record<string, IInitedPlugin[]>>> => {
  const result = await Promise.all(
    configs.map(async (config) => {
      return {
        programId: config.programId,
        pluginsByAccountType: (
          await Promise.all(
            config.accounts.map(async (acc) => {
              const plugins = await initPlugins(acc.plugins);
              return { type: acc.type, plugins };
            })
          )
        ).reduce((acc, { type, plugins }) => {
          acc[type] = plugins.filter(truthy);
          return acc;
        }, {} as Record<string, IInitedPlugin[]>),
      };
    })
  );

  return result.reduce((acc, { programId, pluginsByAccountType }) => {
    acc[programId] = pluginsByAccountType;
    return acc;
  }, {} as Record<string, Record<string, IInitedPlugin[]>>);
};
