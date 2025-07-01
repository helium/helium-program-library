import {
  ataResolver,
  combineResolvers, heliumCommonResolver
} from "@helium/anchor-resolvers"

export const welcomePackResolvers = combineResolvers(
  heliumCommonResolver,
)