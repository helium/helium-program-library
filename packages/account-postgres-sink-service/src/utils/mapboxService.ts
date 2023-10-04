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
      const response = await this.axiosInstance.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?access_token=${process.env.MAPBOX_ACCESS_TOKEN}`
      );
      return response.data;
    });
  }
}
