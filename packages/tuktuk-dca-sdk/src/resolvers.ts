import {
  combineResolvers,
  heliumCommonResolver
} from "@helium/anchor-resolvers"

export const tuktukDcaResolvers = combineResolvers(
  heliumCommonResolver,
)

