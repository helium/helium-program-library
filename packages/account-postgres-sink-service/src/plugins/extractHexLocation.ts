import { DataTypes } from 'sequelize';
import { IPlugin } from '../types';

export const ExtractHexLocationPlugin = ((): IPlugin => {
  const name = 'ExtractHexLocation';
  const init = async (config: { [key: string]: any }) => {
    const updateOnDuplicateFields = ['city', 'state', 'country'];

    const addFields = (schema: { [key: string]: any }, accountName: string) => {
      schema[accountName] = {
        ...schema[accountName],
        lat: DataTypes.DECIMAL(8, 6),
        long: DataTypes.DECIMAL(9, 6),
        city: DataTypes.STRING,
        state: DataTypes.STRING,
        country: DataTypes.STRING,
      };
    };

    const processAccount = async (account: { [key: string]: any }) => {
      return {
        ...account,
        city: 'boby',
        state: 'test',
        country: 'test',
      };
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
