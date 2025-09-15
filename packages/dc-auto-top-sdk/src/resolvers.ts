import {
  ataResolver,
  combineResolvers, heliumCommonResolver
} from "@helium/anchor-resolvers"

export const dcAutoTopResolvers = combineResolvers(
  heliumCommonResolver,
)