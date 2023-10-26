import { IPluginConfig } from '../types';
import { ExtractHexLocationPlugin } from './extractHexLocation';

export const Plugins = [ExtractHexLocationPlugin];
export const initPlugins = async (pluginConfigs: IPluginConfig[] = []) =>
  (
    await Promise.all(
      pluginConfigs.map(async ({ type, config }) => {
        const plugin = Plugins.find(({ name }) => type === name);
        if (plugin) return plugin.init(config);
      })
    )
  ).filter(Boolean);
