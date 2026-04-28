# @helium/anchor-resolvers

Helpers for composing Anchor [custom account resolvers](https://www.anchor-lang.com/). Anchor's built-in resolver API doesn't compose well when multiple programs need to chain their resolution; this package provides `combineResolvers`, `ataResolver`, `heliumCommonResolver` and related utilities used throughout the other SDKs in this repo.
