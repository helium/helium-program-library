import { useAsync, UseAsyncReturn } from "react-async-hook";
import axios from "axios"

const cache = {};

export function useFetchedCachedJson(url: string): UseAsyncReturn<any> {
  return useAsync(async (url: string) => {
    if (cache[url]) {
      return cache[url];
    }
    const response = await axios.get(url);
    const json = await response.data;
    cache[url] = json
    return json;
  }, [url])
}
