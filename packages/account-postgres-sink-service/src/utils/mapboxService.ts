import axios from "axios";
import axiosRetry from "axios-retry";
import pLimit from "p-limit";

export class MapboxService {
  private static instance: MapboxService;
  private axiosInstance: any;
  private limit: any;

  private constructor() {
    this.axiosInstance = axios.create();
    this.limit = pLimit(5); // Limit to 5 concurrent requests

    axiosRetry(this.axiosInstance, {
      retries: 10, // Number of retry attempts
      retryDelay: axiosRetry.exponentialDelay, // Exponential back-off
      retryCondition: (error) => {
        const is429 = error.response ? error.response.status === 429 : false;
        console.log("Received 429, backing off...");

        // Retry on 429 response
        return is429;
      },
    });
  }

  public static getInstance(): MapboxService {
    if (!MapboxService.instance) {
      MapboxService.instance = new MapboxService();
    }
    return MapboxService.instance;
  }

  public async fetchLocation(coords: [number, number]): Promise<any> {
    return this.limit(async () => {
      const response = await axios.get(
        `https://photon.komoot.io/reverse?lat=${coords[0]}&lon=${coords[1]}`
      );

      // Uncomment for mapbox impl
      // const response = await this.axiosInstance.get(
      //   `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?access_token=${process.env.MAPBOX_ACCESS_TOKEN}`
      // );
      return response.data;
    });
  }

  public async fetchParsedLocation(
    coords: [number, number]
  ): Promise<{
    city?: string;
    state?: string;
    country?: string;
    name?: string;
    raw: any[];
  }> {
    const response = await this.fetchLocation(coords);
    let city, state, country, name;
    if (response.features && response.features.length > 0) {
      ({
        properties: { city, state, country, name },
      } = response.features[0]);
    }

    // Uncomment for mapbox impl
    // let placeName, parts, street, city, state, country;
    // if (response.features && response.features.length > 0) {
    //   placeName = response.features[0].place_name;
    //   parts = placeName.split(",");
    //   street = parts[parts.length - 4]?.trim();
    //   city = parts[parts.length - 3]?.trim();
    //   state = parts[parts.length - 2]?.split(" ")[1]?.trim();
    //   country = parts[parts.length - 1]?.trim();
    // }

    return {
      city,
      state,
      country,
      name,
      raw: response.features,
    };
  }
}
