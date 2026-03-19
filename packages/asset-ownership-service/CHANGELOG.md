# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.13](https://github.com/helium/helium-program-library/compare/v0.11.12...v0.11.13) (2026-03-19)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.12](https://github.com/helium/helium-program-library/compare/v0.11.11...v0.11.12) (2026-03-17)


### Bug Fixes

* add throttled periodic GC to prevent OOM in asset-ownership-service ([c0a2ee8](https://github.com/helium/helium-program-library/commit/c0a2ee8abc61f7932f988b7c6b062e94c0d4960b))
* address audit findings in asset-ownership-service ([066ae3c](https://github.com/helium/helium-program-library/commit/066ae3c8372bde1931f2257a5ec7e8d52bb87af3))
* address remaining OOM in asset-ownership-service ([4829bd7](https://github.com/helium/helium-program-library/commit/4829bd7485094e8f9939e3e73cad125b0a8fe985))
* fire GC every 500 blocks unconditionally in asset-ownership-service ([448e894](https://github.com/helium/helium-program-library/commit/448e8945bb5cb02975f6e9d132421c7d28d86183))
* guard asset_owners upserts with last_block check to prevent stale overwrites ([ccb16ea](https://github.com/helium/helium-program-library/commit/ccb16ea098509e0baf29f5610d04e4bf888a013e))
* periodic stream reconnection and more frequent GC in asset-ownership-service ([40823b3](https://github.com/helium/helium-program-library/commit/40823b31e6652e045f8130791eb6d3e36c151bfe))
* reduce memory pressure in asset-ownership and account-postgres-sink services ([2979240](https://github.com/helium/helium-program-library/commit/297924040ab088db4d4a8c8dee617257e3559253))
* remove forced GC causing CPU throttle in asset-ownership-service ([b326a48](https://github.com/helium/helium-program-library/commit/b326a4880398b74b872783febe24f7deb4f65c9a))
* remove periodic reconnect causing session exhaustion in asset-ownership-service ([2872c83](https://github.com/helium/helium-program-library/commit/2872c831a504b42b68a6cb3f8e3a75564f52472a))
* remove unbounded AccountFetchCache causing memory leak ([24cf9ea](https://github.com/helium/helium-program-library/commit/24cf9ea56a2d4aaacfddb6ace0e1c98108e9dad8))
* resolve OOM in asset-ownership-service ([61c70de](https://github.com/helium/helium-program-library/commit/61c70ded334e73c64b67cb92c0450536b8de428a))


### Features

* bulk conditional upsert for asset_owners in upsertOwners ([33681c2](https://github.com/helium/helium-program-library/commit/33681c2c9a2270bbeeedc2dd5633052e72c022f8))





## [0.11.11](https://github.com/helium/helium-program-libary/compare/v0.11.10...v0.11.11) (2026-02-11)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.10](https://github.com/helium/helium-program-libary/compare/v0.11.9...v0.11.10) (2026-02-04)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.9](https://github.com/helium/helium-program-libary/compare/v0.11.8...v0.11.9) (2026-02-03)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.8](https://github.com/helium/helium-program-libary/compare/v0.11.7...v0.11.8) (2026-01-30)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.7](https://github.com/helium/helium-program-libary/compare/v0.11.6...v0.11.7) (2025-12-16)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.6](https://github.com/helium/helium-program-libary/compare/v0.11.5...v0.11.6) (2025-10-27)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.5](https://github.com/helium/helium-program-libary/compare/v0.11.4...v0.11.5) (2025-10-13)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.4](https://github.com/helium/helium-program-libary/compare/v0.11.3...v0.11.4) (2025-09-22)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.3](https://github.com/helium/helium-program-libary/compare/v0.11.2...v0.11.3) (2025-09-18)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.2](https://github.com/helium/helium-program-libary/compare/v0.11.1...v0.11.2) (2025-09-18)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.11.1](https://github.com/helium/helium-program-libary/compare/v0.11.0...v0.11.1) (2025-09-18)

**Note:** Version bump only for package @helium/asset-ownership-service





# [0.11.0](https://github.com/helium/helium-program-libary/compare/v0.10.35...v0.11.0) (2025-09-17)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.35](https://github.com/helium/helium-program-libary/compare/v0.10.34...v0.10.35) (2025-08-19)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.34](https://github.com/helium/helium-program-libary/compare/v0.10.33...v0.10.34) (2025-08-05)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.33](https://github.com/helium/helium-program-libary/compare/v0.10.32...v0.10.33) (2025-08-01)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.32](https://github.com/helium/helium-program-libary/compare/v0.10.31...v0.10.32) (2025-08-01)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.31](https://github.com/helium/helium-program-libary/compare/v0.10.30...v0.10.31) (2025-08-01)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.30](https://github.com/helium/helium-program-libary/compare/v0.10.29...v0.10.30) (2025-07-16)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.29](https://github.com/helium/helium-program-libary/compare/v0.10.28...v0.10.29) (2025-07-15)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.28](https://github.com/helium/helium-program-libary/compare/v0.10.27...v0.10.28) (2025-07-11)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.27](https://github.com/helium/helium-program-libary/compare/v0.10.26...v0.10.27) (2025-07-09)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.26](https://github.com/helium/helium-program-libary/compare/v0.10.25...v0.10.26) (2025-07-07)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.25](https://github.com/helium/helium-program-libary/compare/v0.10.24...v0.10.25) (2025-07-02)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.24](https://github.com/helium/helium-program-libary/compare/v0.10.23...v0.10.24) (2025-07-02)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.23](https://github.com/helium/helium-program-libary/compare/v0.10.22...v0.10.23) (2025-07-02)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.22](https://github.com/helium/helium-program-libary/compare/v0.10.21...v0.10.22) (2025-07-01)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.21](https://github.com/helium/helium-program-libary/compare/v0.10.20...v0.10.21) (2025-07-01)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.20](https://github.com/helium/helium-program-libary/compare/v0.10.19...v0.10.20) (2025-07-01)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.19](https://github.com/helium/helium-program-libary/compare/v0.10.17...v0.10.19) (2025-06-26)

**Note:** Version bump only for package @helium/asset-ownership-service





## [0.10.18](https://github.com/helium/helium-program-libary/compare/v0.10.14...v0.10.18) (2025-06-12)

**Note:** Version bump only for package @helium/asset-ownership-service
