# Helium Program Library - Authorities Documentation

This document provides a comprehensive overview of all authorities across all programs in the Helium Program Library, along with the corresponding CLI commands to update them.

## Table of Contents

1. [DAO Authorities](#dao-authorities)
2. [SubDAO Authorities](#subdao-authorities)
3. [Circuit Breaker Authorities](#circuit-breaker-authorities)
4. [Entity Manager Authorities](#entity-manager-authorities)
5. [Data Credits Authorities](#data-credits-authorities)
6. [Price Oracle Authorities](#price-oracle-authorities)
7. [Fanout Authorities](#fanout-authorities)
8. [Lazy Distributor Authorities](#lazy-distributor-authorities)
9. [Lazy Transactions Authorities](#lazy-transactions-authorities)
10. [Hexboosting Authorities](#hexboosting-authorities)
11. [Treasury Management Authorities](#treasury-management-authorities)
12. [Voter Stake Registry Authorities](#voter-stake-registry-authorities)
13. [Mini Fanout Authorities](#mini-fanout-authorities)
14. [DC Auto Top Authorities](#dc-auto-top-authorities)
15. [HPL Crons Authorities](#hpl-crons-authorities)

---

## DAO Authorities

### DAO Authority
- **Program**: `helium-sub-daos`
- **Account**: `DaoV0`
- **Authority Field**: `authority`
- **Description**: Controls the main DAO operations including emissions schedules, delegator rewards, and HST pool management
- **CLI Command**:
```bash
helium-admin update-dao \
  --hntMint hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux \
  --newAuthority <NEW_AUTHORITY_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### HNT Circuit Breaker Authority
- **Program**: `circuit-breaker`
- **Account**: `MintWindowedCircuitBreakerV0`
- **Authority Field**: `authority`
- **Description**: Controls the HNT mint circuit breaker that limits HNT emissions
- **CLI Command**: (Updated automatically with DAO authority via `update-dao`)

---

## SubDAO Authorities

### SubDAO Authority
- **Program**: `helium-sub-daos`
- **Account**: `SubDaoV0`
- **Authority Field**: `authority`
- **Description**: Controls subDAO operations including emissions, DC burn authority, and active device management. Also updates rewardable entity config
- **CLI Command**:
```bash
helium-admin update-subdao \
  --dntMint <DNT_MINT_ADDRESS> \
  --newAuthority <NEW_AUTHORITY_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1 \
  -n IOT|MOBILE
```

### SubDAO DC Burn Authority
- **Program**: `helium-sub-daos`
- **Account**: `SubDaoV0`
- **Authority Field**: `dc_burn_authority`
- **Description**: Authority to burn delegated data credits
- **CLI Command**:
```bash
helium-admin update-subdao \
  --dntMint <DNT_MINT_ADDRESS> \
  --newDcBurnAuthority <NEW_DC_BURN_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### SubDAO Active Device Authority
- **Program**: `helium-sub-daos`
- **Account**: `SubDaoV0`
- **Authority Field**: `active_device_authority`
- **Description**: Authority that can mark hotspots as active/inactive
- **CLI Command**: (Updated via `update-subdao` with additional parameters)

---

## Circuit Breaker Authorities

### Mint Windowed Circuit Breaker Authority
- **Program**: `circuit-breaker`
- **Account**: `MintWindowedCircuitBreakerV0`
- **Authority Field**: `authority`
- **Description**: Controls mint-based circuit breakers that limit token minting
- **CLI Command**:
```bash
helium-admin update-mint-circuit-breaker \
  --circuitBreaker <CIRCUIT_BREAKER_ADDRESS> \
  --newAuthority <NEW_AUTHORITY_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Account Windowed Circuit Breaker Authority
- **Program**: `circuit-breaker`
- **Account**: `AccountWindowedCircuitBreakerV0`
- **Authority Field**: `authority`
- **Description**: Controls account-based circuit breakers that limit token account operations
- **CLI Command**:
```bash
helium-admin update-account-circuit-breaker \
  --circuitBreaker <CIRCUIT_BREAKER_ADDRESS> \
  --newAuthority <NEW_AUTHORITY_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

List of account windowed breakers (mint ones should update when you update dao auth):

Delegator pool for HNT - `GjumWQJZUcUwYdMkHDPDCRFhA7AQmb1kLapqLmDAYTVY`
HNT Rewards circuit breaker - `73zsmmqCXjvHHhNSib26Y8p3jYiH3UUuyKv71RJDnctW`
IOT Escrow circuit breaker - `5veMSa4ks66zydSaKSPMhV7H2eF88HvuKDArScNH9jaG`
MOBILE Escrow circuit breaker - `4qGj88CX3McdTXEviEaqeP2pnZJxRTsZFWyU3Mrnbku4`

---

## Entity Manager Authorities

### Rewardable Entity Config Authority
- **Program**: `helium-entity-manager`
- **Account**: `RewardableEntityConfigV0`
- **Authority Field**: `authority`
- **Description**: Controls entity configuration including staking requirements and device fees
- **CLI Command**:

NOTE: Not needed if you did update-subdao

```bash
helium-admin update-rewardable-entity-config \
  --dntMint <DNT_MINT_ADDRESS> \
  --name <ENTITY_NAME> \
  --newAuthority <NEW_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Maker Update Authority
- **Program**: `helium-entity-manager`
- **Account**: `MakerV0`
- **Authority Field**: `update_authority`
- **Description**: Authority that can update maker configuration
- **CLI Command**:
```bash
helium-admin update-maker \
  --name <MAKER_NAME> \
  --updateAuthority <NEW_UPDATE_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Maker Issuing Authority
- **Program**: `helium-entity-manager`
- **Account**: `MakerV0`
- **Authority Field**: `issuing_authority`
- **Description**: Authority that can issue hotspots for the maker
- **CLI Command**:
```bash
helium-admin update-maker \
  --name <MAKER_NAME> \
  --issuingAuthority <NEW_ISSUING_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Carrier Update Authority
- **Program**: `mobile-entity-manager`
- **Account**: `CarrierV0`
- **Authority Field**: `update_authority`
- **Description**: Authority that can update carrier configuration
- **CLI Command**:
```bash
helium-admin update-carrier \
  --name <CARRIER_NAME> \
  --updateAuthority <NEW_UPDATE_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Carrier Issuing Authority
- **Program**: `mobile-entity-manager`
- **Account**: `CarrierV0`
- **Authority Field**: `issuing_authority`
- **Description**: Authority that can issue mobile hotspots for the carrier
- **CLI Command**:
```bash
helium-admin update-carrier \
  --name <CARRIER_NAME> \
  --issuingAuthority <NEW_ISSUING_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Carrier Hexboost Authority
- **Program**: `mobile-entity-manager`
- **Account**: `CarrierV0`
- **Authority Field**: `hexboost_authority`
- **Description**: Authority that can manage hexboosting for the carrier
- **CLI Command**:
```bash
helium-admin update-carrier \
  --name <CARRIER_NAME> \
  --hexboostAuthority <NEW_HEXBOOST_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

---

## Data Credits Authorities

### Data Credits Authority
- **Program**: `data-credits`
- **Account**: `DataCreditsV0`
- **Authority Field**: `authority`
- **Description**: Controls data credits operations and configuration
- **CLI Command**:
```bash
helium-admin update-data-credits \
  --dcMint <DC_MINT_ADDRESS> \
  --newAuthority <NEW_AUTHORITY_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

---

## Lazy Distributor Authorities

### Lazy Distributor Authority
- **Program**: `lazy-distributor`
- **Account**: `LazyDistributorV0`
- **Authority Field**: `authority`
- **Description**: Controls lazy distributor operations and reward distribution
- **CLI Command**:
```bash
helium-admin update-lazy-distributor \
  --subdaoMint <SUBDAO_MINT_ADDRESS> \
  --newAuthority <NEW_AUTHORITY_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Lazy Distributor Approver
- **Program**: `lazy-distributor`
- **Account**: `LazyDistributorV0`
- **Authority Field**: `approver`
- **Description**: Optional approver for reward distribution transactions
- **CLI Command**:
```bash
helium-admin update-lazy-distributor \
  --subdaoMint <SUBDAO_MINT_ADDRESS> \
  --newApprover <NEW_APPROVER_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

---

## Lazy Transactions Authorities

### Lazy Transactions Authority
- **Program**: `lazy-transactions`
- **Account**: `LazyTransactionsV0`
- **Authority Field**: `authority`
- **Description**: Controls lazy transactions execution and merkle tree management
- **CLI Command**:
```bash
helium-admin update-lazy-transactions \
  --name <LAZY_TRANSACTIONS_NAME> \
  --newAuthority <NEW_AUTHORITY_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

---

## Hexboosting Authorities

### Boost Config Start Authority
- **Program**: `hexboosting`
- **Account**: `BoostConfigV0`
- **Authority Field**: `start_authority`
- **Description**: Authority that can start hexboosting for locations
- **CLI Command**:
```bash
helium-admin update-boost-config \
  --dntMint <DNT_MINT_ADDRESS> \
  --startAuthority <NEW_START_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

### Boost Config Rent Reclaim Authority
- **Program**: `hexboosting`
- **Account**: `BoostConfigV0`
- **Authority Field**: `rent_reclaim_authority`
- **Description**: Authority that can reclaim rent from expired hexboosts
- **CLI Command**:
```bash
helium-admin update-boost-config \
  --dntMint <DNT_MINT_ADDRESS> \
  --rentReclaimAuthority <NEW_RENT_RECLAIM_AUTHORITY> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

---

## Treasury Management Authorities

### Treasury Management Authority
- **Program**: `treasury-management`
- **Account**: `TreasuryManagementV0`
- **Authority Field**: `authority`
- **Description**: Controls treasury management operations and bonding curves
- **CLI Command**: No direct cli command, owned by the sub dao

---

## Voter Stake Registry Authorities

### Registrar Authority
- **Program**: `voter-stake-registry`
- **Account**: `Registrar`
- **Authority Field**: `realm_authority`
- **Description**: Controls voter stake registry operations
- **CLI Command**:
```bash
helium-admin update-registrar-authorities \
  --registrar <REGISTRAR_ADDRESS> \
  --authority <NEW_AUTHORITY_ADDRESS>
```

---

## DC Auto Top Authorities

### Auto Top Off Authority
- **Program**: `dc-auto-top`
- **Account**: `AutoTopOffV0`
- **Authority Field**: `authority`
- **Description**: Controls automatic data credits top-off operations
- **CLI Command**: TODO

---

## Proxy Config Authorities

### Proxy Config Authority
- **Program**: `nft-proxy` (external)
- **Account**: `ProxyConfigV0`
- **Authority Field**: `authority`
- **Description**: Controls proxy configuration for NFT operations
- **CLI Command**:
```bash
helium-admin update-proxy-config \
  --name <PROXY_CONFIG_NAME> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1
```

---

## Token Metadata Authorities

### Token Metadata Update Authority
- **Program**: `metaplex` (external)
- **Account**: `Metadata`
- **Authority Field**: `update_authority`
- **Description**: Controls token metadata updates
- **CLI Command**:
```bash
helium-admin update-token-metadata \
  --mint <MINT_ADDRESS> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1 \
  --newAuthority <NEW_AUTHORITY>
```

## Organization Authorities (modgov)

### Organization Authority
- **Program**: `organizations` (external, modular-governance)
- **Account**: `OrganizationV0`
- **Authority Field**: `authority`
- **Description**: Controls token metadata updates
- **CLI Command**:
```bash
helium-admin update-organization \
  --orgName <NAME> \
  --multisig <MULTISIG_ADDRESS> \
  --authorityIndex 1 \
  --newAuthority <NEW_AUTHORITY>
```

---

## Common CLI Parameters

Most CLI commands support the following common parameters:

- `--wallet` or `-k`: Path to wallet keypair (default: `~/.config/solana/id.json`)
- `--url` or `-u`: Solana RPC URL (default: `http://127.0.0.1:8899`)
- `--multisig`: Address of the squads multisig to be authority
- `--authorityIndex`: Authority index for squads (default: 1)
- `--executeTransaction`: Execute the transaction immediately

## Notes

1. **Circuit Breaker Integration**: Many programs automatically create and manage circuit breakers. When updating main authorities (like DAO or SubDAO), associated circuit breaker authorities are often updated automatically.

2. **Multisig Support**: All CLI commands support squads multisig integration for secure authority management.

3. **Authority Hierarchy**: Some authorities have hierarchical relationships where updating a parent authority may automatically update child authorities.

4. **Missing CLI Commands**: Some programs may not have direct CLI commands for authority updates and may require programmatic updates through the SDK.

5. **External Programs**: Some authorities reference external programs (like Metaplex) that are not part of the Helium Program Library but are used by Helium programs.

---

*This documentation is maintained as part of the Helium Program Library. For questions or updates, please refer to the repository issues or contact the development team.*