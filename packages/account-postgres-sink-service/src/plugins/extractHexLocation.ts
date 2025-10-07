import BN from "bn.js";
import { cellToLatLng } from "h3-js";
import { camelize } from "inflection";
import _omit from "lodash/omit";
import { DataTypes, Model, QueryTypes } from "sequelize";
import { IPlugin } from "../types";
import { database } from "../utils/database";
import { MapboxService } from "../utils/mapboxService";

const parseH3BNLocation = (location: BN) =>
  cellToLatLng(location.toString("hex"));

export class ReverseGeoCache extends Model {
  declare location: number;
  declare street: string;
  declare city: string;
  declare state: string;
  declare country: string;
  declare lat: number;
  declare lng: number;
  declare raw: Object;
}

ReverseGeoCache.init(
  {
    location: {
      type: DataTypes.DECIMAL,
      primaryKey: true,
    },
    street: DataTypes.STRING,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
    lat: DataTypes.DECIMAL(8, 6),
    long: DataTypes.DECIMAL(9, 6),
    raw: DataTypes.JSONB,
  },
  {
    sequelize: database,
    modelName: "reverse_geo_cache",
    tableName: "reverse_geo_cache",
    underscored: true,
    timestamps: true,
  }
);

const locationFetchCache: {
  [location: string]: Promise<ReverseGeoCache | undefined>;
} = {};
export const ExtractHexLocationPlugin = ((): IPlugin => {
  const name = "ExtractHexLocation";
  const init = async (config: { [key: string]: any }) => {
    const updateOnDuplicateFields = [
      "city",
      "state",
      "country",
      "street",
      "lat",
      "long",
    ];

    const existingColumns = (
      await database.query(
        `
        SELECT column_name
          FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reverse_geo_cache'
      `,
        { type: QueryTypes.SELECT }
      )
    ).map((x: any) => camelize(x.column_name, true));
    const columns = Object.keys(ReverseGeoCache.getAttributes()).map((att) =>
      camelize(att, true)
    );

    if (
      !existingColumns.length ||
      !columns.every((col) => existingColumns.includes(col))
    ) {
      await ReverseGeoCache.sync({ alter: true });
    }

    const addFields = (schema: { [key: string]: any }, accountName: string) => {
      schema[accountName] = {
        ...schema[accountName],
        lat: DataTypes.DECIMAL(8, 6),
        long: DataTypes.DECIMAL(9, 6),
        street: DataTypes.STRING,
        city: DataTypes.STRING,
        state: DataTypes.STRING,
        country: DataTypes.STRING,
      };
    };

    const mapbox = MapboxService.getInstance();
    const processAccount = async (
      account: { [key: string]: any },
      transaction?: any,
      lastBlock?: number
    ) => {
      let reverseGeod: ReverseGeoCache | null = null;
      const location = account[camelize(config.field || "location", true)];
      if (location) {
        reverseGeod = await ReverseGeoCache.findByPk(location.toString(), {
          attributes: updateOnDuplicateFields,
          transaction, // Use the passed transaction to reuse the connection
        });
        if (!reverseGeod) {
          if (!locationFetchCache[location]) {
            locationFetchCache[location] = (async () => {
              const coords = parseH3BNLocation(new BN(location));
              try {
                const { city, state, country, name, raw } =
                  await mapbox.fetchParsedLocation(coords);
                return await ReverseGeoCache.create(
                  {
                    location: location.toString(),
                    street: name,
                    city,
                    state,
                    country,
                    lat: coords[0],
                    long: coords[1],
                    raw,
                  },
                  {
                    transaction, // Use the passed transaction here too
                  }
                );
              } catch (e) {
                // Clean up cache on error to prevent memory leaks
                delete locationFetchCache[location];
                if (!config.ignoreErrors) {
                  throw e;
                }
                return undefined;
              }
            })();
          }

          try {
            reverseGeod = (await locationFetchCache[location]) || null;
            // Once the create call finishes, we can cleanup this promise. Subsequent queries to postgres will discover
            // the account. This helps with memory management
            delete locationFetchCache[location];
          } catch (e) {
            // Clean up cache on error
            delete locationFetchCache[location];
            if (!config.ignoreErrors) {
              throw e;
            }
          }
        }
      }
      // Remove raw response, format camelcase
      if (reverseGeod) {
        delete reverseGeod.dataValues.raw;
      }

      return {
        ...account,
        city: null,
        state: null,
        country: null,
        street: null,
        lat: null,
        long: null,
        ..._omit(reverseGeod?.dataValues || {}, ["createdAt", "updatedAt"]),
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
