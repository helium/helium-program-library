# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.4.3](https://github.com/helium/helium-program-library/compare/v0.4.2...v0.4.3) (2023-10-26)

**Note:** Version bump only for package helium-program-library





## [0.4.2](https://github.com/helium/helium-program-library/compare/v0.4.1...v0.4.2) (2023-10-19)


### Features

* **#451:** Create cloudfront invalidator ([#452](https://github.com/helium/helium-program-library/issues/452)) ([e5d44a0](https://github.com/helium/helium-program-library/commit/e5d44a0d1fcc92fd5a39d1b1dc9b760be27bc19d)), closes [#451](https://github.com/helium/helium-program-library/issues/451) [#441](https://github.com/helium/helium-program-library/issues/441)





## [0.4.1](https://github.com/helium/helium-program-library/compare/v0.4.0...v0.4.1) (2023-10-12)


### Reverts

* Revert "Revert lazy transactions bitmap" ([46b3cdf](https://github.com/helium/helium-program-library/commit/46b3cdf11c8348ef2b3a4a5c29b36e9206e148f2))





# [0.4.0](https://github.com/helium/helium-program-library/compare/v0.2.21...v0.4.0) (2023-09-22)


### Features

* **#373:** replace clockwork ([#388](https://github.com/helium/helium-program-library/issues/388)) ([55033c7](https://github.com/helium/helium-program-library/commit/55033c718df08f41eb2f77d726d59d916ebbd677)), closes [#373](https://github.com/helium/helium-program-library/issues/373)
* **#376:** Replace lazy transactions markers with a bitmap to reclaim rent ([#380](https://github.com/helium/helium-program-library/issues/380)) ([a691257](https://github.com/helium/helium-program-library/commit/a6912570d4e3d89869cd13c5cfc8ce8c4355148e)), closes [#376](https://github.com/helium/helium-program-library/issues/376) [#376](https://github.com/helium/helium-program-library/issues/376)
* **#379:** Automate npm publish and fix devnet conflicting sqds txns ([#386](https://github.com/helium/helium-program-library/issues/386)) ([a4a3780](https://github.com/helium/helium-program-library/commit/a4a37806fefe82ca9a38f04c311f600ad1f7c36c))


### Reverts

* Revert "Add back mobile genesis fix for devnet" ([93e9a2c](https://github.com/helium/helium-program-library/commit/93e9a2c370ba77a49b02efc2590ddf3039465ed6))





## [0.3.2](https://github.com/helium/helium-program-library/compare/v0.2.21...v0.3.2) (2023-09-16)


### Features

* **#373:** replace clockwork ([#388](https://github.com/helium/helium-program-library/issues/388)) ([55033c7](https://github.com/helium/helium-program-library/commit/55033c718df08f41eb2f77d726d59d916ebbd677)), closes [#373](https://github.com/helium/helium-program-library/issues/373)
* **#376:** Replace lazy transactions markers with a bitmap to reclaim rent ([#380](https://github.com/helium/helium-program-library/issues/380)) ([a691257](https://github.com/helium/helium-program-library/commit/a6912570d4e3d89869cd13c5cfc8ce8c4355148e)), closes [#376](https://github.com/helium/helium-program-library/issues/376) [#376](https://github.com/helium/helium-program-library/issues/376)
* **#379:** Automate npm publish and fix devnet conflicting sqds txns ([#386](https://github.com/helium/helium-program-library/issues/386)) ([a4a3780](https://github.com/helium/helium-program-library/commit/a4a37806fefe82ca9a38f04c311f600ad1f7c36c))


### Reverts

* Revert "Add back mobile genesis fix for devnet" ([93e9a2c](https://github.com/helium/helium-program-library/commit/93e9a2c370ba77a49b02efc2590ddf3039465ed6))





## [0.3.1](https://github.com/helium/helium-program-library/compare/v0.2.21...v0.3.1) (2023-09-15)


### Features

* **#373:** replace clockwork ([#388](https://github.com/helium/helium-program-library/issues/388)) ([55033c7](https://github.com/helium/helium-program-library/commit/55033c718df08f41eb2f77d726d59d916ebbd677)), closes [#373](https://github.com/helium/helium-program-library/issues/373)
* **#376:** Replace lazy transactions markers with a bitmap to reclaim rent ([#380](https://github.com/helium/helium-program-library/issues/380)) ([a691257](https://github.com/helium/helium-program-library/commit/a6912570d4e3d89869cd13c5cfc8ce8c4355148e)), closes [#376](https://github.com/helium/helium-program-library/issues/376) [#376](https://github.com/helium/helium-program-library/issues/376)
* **#379:** Automate npm publish and fix devnet conflicting sqds txns ([#386](https://github.com/helium/helium-program-library/issues/386)) ([a4a3780](https://github.com/helium/helium-program-library/commit/a4a37806fefe82ca9a38f04c311f600ad1f7c36c))


### Reverts

* Revert "Add back mobile genesis fix for devnet" ([93e9a2c](https://github.com/helium/helium-program-library/commit/93e9a2c370ba77a49b02efc2590ddf3039465ed6))





# [0.3.0](https://github.com/helium/helium-program-library/compare/v0.2.21...v0.3.0) (2023-09-14)

### Breaking

  * `distributor-oracle` - `bulkFormTransactions` now takes batch functions for asset and proof fetching, instead of individual fetch functions. If you were passing custom functions, this code will need to change.

### Features

* **#373:** replace clockwork ([#388](https://github.com/helium/helium-program-library/issues/388)) ([55033c7](https://github.com/helium/helium-program-library/commit/55033c718df08f41eb2f77d726d59d916ebbd677)), closes [#373](https://github.com/helium/helium-program-library/issues/373)
* **#376:** Replace lazy transactions markers with a bitmap to reclaim rent ([#380](https://github.com/helium/helium-program-library/issues/380)) ([a691257](https://github.com/helium/helium-program-library/commit/a6912570d4e3d89869cd13c5cfc8ce8c4355148e)), closes [#376](https://github.com/helium/helium-program-library/issues/376) [#376](https://github.com/helium/helium-program-library/issues/376)
* **#379:** Automate npm publish and fix devnet conflicting sqds txns ([#386](https://github.com/helium/helium-program-library/issues/386)) ([a4a3780](https://github.com/helium/helium-program-library/commit/a4a37806fefe82ca9a38f04c311f600ad1f7c36c))


### Reverts

* Revert "Add back mobile genesis fix for devnet" ([93e9a2c](https://github.com/helium/helium-program-library/commit/93e9a2c370ba77a49b02efc2590ddf3039465ed6))





## [0.2.22](https://github.com/helium/helium-program-library/compare/v0.2.21...v0.2.22) (2023-09-13)


### Features

* **#373:** replace clockwork ([#388](https://github.com/helium/helium-program-library/issues/388)) ([55033c7](https://github.com/helium/helium-program-library/commit/55033c718df08f41eb2f77d726d59d916ebbd677)), closes [#373](https://github.com/helium/helium-program-library/issues/373)
* **#376:** Replace lazy transactions markers with a bitmap to reclaim rent ([#380](https://github.com/helium/helium-program-library/issues/380)) ([a691257](https://github.com/helium/helium-program-library/commit/a6912570d4e3d89869cd13c5cfc8ce8c4355148e)), closes [#376](https://github.com/helium/helium-program-library/issues/376) [#376](https://github.com/helium/helium-program-library/issues/376)
* **#379:** Automate npm publish and fix devnet conflicting sqds txns ([#386](https://github.com/helium/helium-program-library/issues/386)) ([a4a3780](https://github.com/helium/helium-program-library/commit/a4a37806fefe82ca9a38f04c311f600ad1f7c36c))


### Reverts

* Revert "Add back mobile genesis fix for devnet" ([93e9a2c](https://github.com/helium/helium-program-library/commit/93e9a2c370ba77a49b02efc2590ddf3039465ed6))





## [0.2.15](https://github.com/helium/helium-program-library/compare/v0.2.14...v0.2.15) (2023-07-31)

**Note:** Version bump only for package helium-program-library





## [0.2.7](https://github.com/helium/helium-program-library/compare/v0.2.6...v0.2.7) (2023-06-29)

**Note:** Version bump only for package helium-program-library





## [0.2.3](https://github.com/helium/helium-program-library/compare/v0.1.5...v0.2.3) (2023-06-16)


### Reverts

* Revert "Add support for data only hotspots (#246)" ([1728939](https://github.com/helium/helium-program-library/commit/17289397ff60de603fbd9cd90b2649373721511f)), closes [#246](https://github.com/helium/helium-program-library/issues/246)





## [0.2.2](https://github.com/helium/helium-program-library/compare/v0.1.5...v0.2.2) (2023-06-08)


### Reverts

* Revert "Add support for data only hotspots (#246)" ([1728939](https://github.com/helium/helium-program-library/commit/17289397ff60de603fbd9cd90b2649373721511f)), closes [#246](https://github.com/helium/helium-program-library/issues/246)





## [0.2.1](https://github.com/helium/helium-program-library/compare/v0.1.5...v0.2.1) (2023-06-08)


### Reverts

* Revert "Add support for data only hotspots (#246)" ([1728939](https://github.com/helium/helium-program-library/commit/17289397ff60de603fbd9cd90b2649373721511f)), closes [#246](https://github.com/helium/helium-program-library/issues/246)





# [0.2.0](https://github.com/helium/helium-program-library/compare/v0.1.5...v0.2.0) (2023-06-06)


### Reverts

* Revert "Add support for data only hotspots (#246)" ([66247c7](https://github.com/helium/helium-program-library/commit/66247c739ad743b9eda2776c80a1e199900dd896)), closes [#246](https://github.com/helium/helium-program-library/issues/246)
