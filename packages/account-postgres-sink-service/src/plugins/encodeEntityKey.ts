import { DataTypes } from "sequelize";
import { IPlugin } from "../types";
import bs58 from "bs58";
import { camelize } from "inflection";

export const EncodeEntityKeyPlugin = ((): IPlugin => {
  const name = "EncodeEntityKey";
  const init = async (config: { [key: string]: any }) => {
    const updateOnDuplicateFields = ["encoded_entity_key"];
    const addFields = (schema: { [key: string]: any }, accountName: string) => {
      schema[accountName] = {
        ...schema[accountName],
        encoded_entity_key: DataTypes.TEXT,
      };
    };

    const addIndexes = (
      schema: { [key: string]: any },
      accountName: string
    ) => {
      schema[accountName] = {
        ...schema[accountName],
        indexes: [
          {
            fields: ["encoded_entity_key"],
            name: `idx_encoded_entity_key`,
            unique: true,
          },
        ],
      };
    };

    const processAccount = async (account: { [key: string]: any }) => {
      const entityKey = account[camelize(config.field || "entity_key", true)];
      const keySerializationRaw = account[camelize("key_serialization", true)];
      const keySerialization =
        typeof keySerializationRaw === "string"
          ? keySerializationRaw.trim().toLowerCase()
          : String(keySerializationRaw).trim().toLowerCase();
      let encodedEntityKey: string | null = null;
      if (entityKey && keySerialization) {
        if (keySerialization === "utf8") {
          encodedEntityKey = Buffer.from(entityKey, "utf8").toString("utf8");
        } else if (keySerialization === "b58" || keySerialization === "bs58") {
          encodedEntityKey = bs58.encode(entityKey);
        }
      }

      return {
        ...account,
        encoded_entity_key: encodedEntityKey,
      };
    };

    return {
      updateOnDuplicateFields,
      addFields,
      addIndexes,
      processAccount,
    };
  };

  return {
    name,
    init,
  };
})();
