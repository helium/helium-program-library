import {
  ataResolver,
  combineResolvers, heliumCommonResolver
} from "@helium/anchor-resolvers"

export const miniFanoutResolvers = combineResolvers(
  heliumCommonResolver,
)