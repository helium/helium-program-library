import axios from "axios";
import BN from "bn.js";
import { cellToLatLng } from "h3-js";
import { camelize } from "inflection";
import _omit from "lodash/omit";
import { DECIMAL, DataTypes, Model, QueryTypes } from "sequelize";
import { IPlugin } from "../types";
import { database } from "../utils/database";

const parseH3BNLocation = (location: BN) =>
  cellToLatLng(location.toString("hex"));

export class ReverseGeoCache extends Model {
  declare h3: string;
  declare streetAddress: string;
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
      type: DECIMAL,
      primaryKey: true,
    },
    streetAddress: DataTypes.STRING,
    lat: DataTypes.DECIMAL(8, 6),
    long: DataTypes.DECIMAL(9, 6),
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
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
export const ExtractHexLocationPlugin = ((): IPlugin => {
  const name = "ExtractHexLocation";
  const init = async (config: { [key: string]: any }) => {
    const updateOnDuplicateFields = [
      "city",
      "state",
      "country",
      "street_address",
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
      ReverseGeoCache.sync({ alter: true });
    }
    await ReverseGeoCache.sync({ alter: true });

    const addFields = (schema: { [key: string]: any }, accountName: string) => {
      schema[accountName] = {
        ...schema[accountName],
        lat: DataTypes.DECIMAL(8, 6),
        long: DataTypes.DECIMAL(9, 6),
        streetAddress: DataTypes.STRING,
        city: DataTypes.STRING,
        state: DataTypes.STRING,
        country: DataTypes.STRING,
      };
    };

    const processAccount = async (account: { [key: string]: any }) => {
      let reverseGeod: ReverseGeoCache | null = null;
      const location = account[config.field || "location"];
      if (location) {
        reverseGeod = await ReverseGeoCache.findByPk(location.toString(), {
          attributes: updateOnDuplicateFields,
        });
        if (!reverseGeod) {
          const coords = parseH3BNLocation(location);
          const response = await axios.get(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?access_token=${process.env.MAPBOX_ACCESS_TOKEN}`
          );
          let placeName, parts, streetAddress, city, state, country;
          if (response.data.features && response.data.features.length > 0) {
            placeName = response.data.features[0].place_name;
            parts = placeName.split(",");
            streetAddress = parts[parts.length - 4]?.trim();
            city = parts[parts.length - 3]?.trim();
            state = parts[parts.length - 2]?.split(" ")[1]?.trim();
            country = parts[parts.length - 1]?.trim();
          }
          reverseGeod = await ReverseGeoCache.create({
            location: location.toString(),
            streetAddress,
            city,
            state,
            country,
            lat: coords[0],
            long: coords[1],
            raw: response.data.features,
          });
        }
      }
      // Remove raw response, format camelcase
      if (reverseGeod) {
        delete reverseGeod.dataValues.raw;
        reverseGeod.dataValues.streetAddress =
          reverseGeod?.dataValues.street_address;
        delete reverseGeod.dataValues.street_address;
      }

      return {
        ...account,
        city: null,
        state: null,
        country: null,
        streetAddress: null,
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
