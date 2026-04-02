# Enrich actionMetadata for Transaction History

## Problem

Transaction history items returned by `GET /api/v1/transactions/history/{payer}` have thin `actionMetadata` that prevents the frontend from rendering rich transaction details. Examples:

- `hotspot_update` only stores `{ type, hotspotKey, deviceType }` — no indication of what was actually updated (gain, elevation, location)
- `token_transfer` stores raw bones amount (`"500000000"`) with no decimals, token name, or human-readable amount — frontend can't display "5 HNT"
- On-chain `data_credits.mintDataCreditsV0` stores only `{ program, instruction }` — no amounts at all, because DC minting uses CPI `MintTo` which the classifier's SPL Transfer detection doesn't catch
- The classifier uses stale HNT and IOT mint addresses, so token name resolution fails for those tokens

## Approach

1. Use the existing `toTokenAmountOutput()` / `TokenAmountOutput` shape (`{ amount, decimals, uiAmount, uiAmountString, mint }`) to represent amounts in actionMetadata — this is already the API's standard token amount format
2. Create a shared `TOKEN_NAMES` map in `src/lib/constants/tokens.ts` as the single source of truth for mint-to-name resolution
3. Enrich each procedure's actionMetadata with available input/computed values
4. Fix the classifier to fall back to balance changes when SPL transfers aren't detected

No schema changes needed — `actionMetadata` is `Record<string, unknown>` on both the DB model and client output schema.

## Changes

### 1. Shared utility: `TOKEN_NAMES` map

**File:** `src/lib/constants/tokens.ts`

Add a `TOKEN_NAMES` map derived from `TOKEN_MINTS`:

```ts
export const TOKEN_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(TOKEN_MINTS).map(([name, mint]) => [mint, name]),
);
```

This produces `{ "So111...112": "WSOL", "EPjFW...t1v": "USDC", ... }`.

Procedures and the classifier both import from here — one source of truth.

### 2. Fix classifier's stale mint addresses

**File:** `src/lib/utils/transaction-classifier.ts`

Delete the hardcoded `KNOWN_TOKEN_NAMES` map (lines 52-59) which has wrong mints:

- HNT: `hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263` (wrong)
- IOT: `iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9o2t` (wrong)

Correct mints (from `TOKEN_MINTS`):

- HNT: `hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux`
- IOT: `iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns`

Replace all references to `KNOWN_TOKEN_NAMES` with the imported `TOKEN_NAMES` from `src/lib/constants/tokens.ts`.

### 3. Classifier: balance change fallback for generic IDL path

**File:** `src/lib/utils/transaction-classifier.ts` (lines 669-684)

Current behavior: the generic IDL-decoded path (step 2) only includes token info from `tokenTransfers[0]` — which only detects SPL `Transfer`/`TransferChecked` instructions. Misses CPI mints, burns, and other balance-changing operations.

Change: when `tokenTransfers` is empty and `wallet` is provided, call `getWalletBalanceChanges(tx, wallet)` and include the result as a `transfers` array in `actionMetadata`. This matches the shape already used by `rewards_distribution` actions.

```ts
// Before
const transfer = tokenTransfers[0];
return {
  actionType: `${programLabel}.${decoded.name}`,
  actionMetadata: {
    program: programLabel,
    instruction: decoded.name,
    ...(transfer
      ? {
          mint: transfer.mint,
          amount: transfer.amount,
          tokenName: transfer.tokenName,
        }
      : {}),
  },
};

// After
const transfer = tokenTransfers[0];
const transfers = transfer
  ? [transfer]
  : wallet
    ? (getWalletBalanceChanges(tx, wallet) ?? [])
    : [];
return {
  actionType: `${programLabel}.${decoded.name}`,
  actionMetadata: {
    program: programLabel,
    instruction: decoded.name,
    ...(transfers.length > 0 ? { transfers } : {}),
  },
};
```

This normalizes the shape: `transfers` is always an array of `TokenTransfer` (`{ mint, amount, from, to, tokenName }`), same as rewards_distribution. The old `mint`/`amount`/`tokenName` flat fields are replaced with the array form for consistency.

### 4. Procedure enrichments

All procedures below are in `src/server/api/routers/`.

#### 4a. `hotspots/procedures/updateHotspotInfo.ts` (line 287)

```ts
// Before
actionMetadata: { type: "hotspot_update", hotspotKey: entityPubKey, deviceType: input.deviceType }

// After (IoT)
actionMetadata: {
  type: "hotspot_update",
  hotspotKey: entityPubKey,
  deviceType: input.deviceType,
  ...(location && { location }),
  ...(input.gain !== undefined && { gain: input.gain }),
  ...(input.elevation !== undefined && { elevation: input.elevation }),
}

// After (Mobile)
actionMetadata: {
  type: "hotspot_update",
  hotspotKey: entityPubKey,
  deviceType: input.deviceType,
  ...(location && { location }),
  ...(input.deploymentInfo && { deploymentType: input.deploymentInfo.type }),
}
```

Since IoT and mobile are already in separate branches (`if (input.deviceType === "iot")`), each branch sets its own actionMetadata with the relevant fields. Only include fields that were actually provided (not undefined).

#### 4b. `tokens/procedures/transfer.ts` (lines 133-143)

```ts
// Before
metadata: { type: "token_transfer", description: "Transfer Token", mint: tokenAmount.mint, amount: tokenAmount.amount, recipient: destination }
actionMetadata: { type: "token_transfer", mint: tokenAmount.mint, amount: tokenAmount.amount, recipient: destination }

// After
const transferTokenAmount = toTokenAmountOutput(new BN(tokenAmount.amount), tokenAmount.mint);
const tokenName = TOKEN_NAMES[tokenAmount.mint];

// In metadata:
metadata: { type: "token_transfer", description: `Transfer ${tokenName ?? "Token"}`, tokenAmount: transferTokenAmount, tokenName, recipient: destination }

// In actionMetadata:
actionMetadata: { type: "token_transfer", tokenAmount: transferTokenAmount, tokenName, recipient: destination }
```

`toTokenAmountOutput` is already imported. `TOKEN_NAMES` is a new import from `@/lib/constants/tokens`. For SOL transfers, `isSol` is already computed — the description uses `tokenName` which resolves to `"WSOL"` for SOL.

#### 4c. `hotspots/procedures/createAutomation.ts` (line 317)

```ts
// Before
actionMetadata: { type: "setup_automation" }

// After
actionMetadata: { type: "setup_automation", schedule: input.schedule, duration: input.duration }
```

`input.schedule` and `input.duration` are available — they're used earlier in the procedure to configure the automation.

#### 4d. `hotspots/procedures/fundAutomation.ts` (line 177)

```ts
// Before
actionMetadata: { type: "fund_automation" }

// After
actionMetadata: { type: "fund_automation", additionalDuration: input.additionalDuration }
```

`input.additionalDuration` is the number of additional periods to fund.

#### 4e. `welcomePacks/procedures/create.ts` (line 260)

```ts
// Before
actionMetadata: { type: "welcome_pack_create", assetId }

// After
actionMetadata: {
  type: "welcome_pack_create",
  assetId,
  solAmount: toTokenAmountOutput(new BN(input.solAmount.amount), input.solAmount.mint),
  recipientCount: input.rewardsSplit.length,
}
```

`input.solAmount` is a `TokenAmountInput` (has `.amount` and `.mint`). `input.rewardsSplit` is the recipients array.

#### 4f. `governance/procedures/positions/create.ts` (line 353)

```ts
// Before
actionMetadata: { type: "position_create", tokenMint: tokenAmount.mint, amount: tokenAmount.amount, lockupKind, lockupPeriodDays: lockupPeriodsInDays }

// After
actionMetadata: {
  type: "position_create",
  tokenAmount: toTokenAmountOutput(new BN(tokenAmount.amount), tokenAmount.mint),
  tokenName: TOKEN_NAMES[tokenAmount.mint],
  lockupKind,
  lockupPeriodDays: lockupPeriodsInDays,
}
```

#### 4g. `swap/procedures/getInstructions.ts` (line 173)

```ts
// Before
actionMetadata: { type: "swap", inputMint: quoteResponse.inputMint, outputMint: quoteResponse.outputMint, inputAmount: quoteResponse.inAmount, outputAmount: quoteResponse.outAmount }

// After
actionMetadata: {
  type: "swap",
  inputTokenAmount: toTokenAmountOutput(new BN(quoteResponse.inAmount), quoteResponse.inputMint),
  outputTokenAmount: toTokenAmountOutput(new BN(quoteResponse.outAmount), quoteResponse.outputMint),
  inputTokenName: TOKEN_NAMES[quoteResponse.inputMint],
  outputTokenName: TOKEN_NAMES[quoteResponse.outputMint],
}
```

Verify that `toTokenAmountOutput` is already imported or add import. `quoteResponse.inAmount` and `outAmount` are string amounts in smallest units from Jupiter.

#### 4h. `governance/procedures/positions/split.ts` (line 193)

```ts
// Before
actionMetadata: { type: "position_split", positionMint, amount }

// After
actionMetadata: {
  type: "position_split",
  positionMint,
  tokenAmount: toTokenAmountOutput(amountBN, depositMint),
  tokenName: TOKEN_NAMES[depositMint],
}
```

`amountBN` is already computed from `new BN(amount)`. `depositMint` is derived from `registrar.votingMints[sourcePositionAcc.votingMintConfigIdx].mint` — already in scope.

#### 4i. `governance/procedures/positions/transfer.ts` (line 160)

```ts
// Before
actionMetadata: { type: "position_transfer", positionMint, targetPositionMint, amount }

// After
actionMetadata: {
  type: "position_transfer",
  positionMint,
  targetPositionMint,
  tokenAmount: toTokenAmountOutput(amountBN, depositMint),
  tokenName: TOKEN_NAMES[depositMint],
}
```

Same pattern as split — `amountBN` and `depositMint` already in scope.

## Files changed

| File                                                                 | Change type                                  |
| -------------------------------------------------------------------- | -------------------------------------------- |
| `src/lib/constants/tokens.ts`                                        | Add `TOKEN_NAMES` map                        |
| `src/lib/utils/transaction-classifier.ts`                            | Fix stale mints, add balance change fallback |
| `src/server/api/routers/hotspots/procedures/updateHotspotInfo.ts`    | Enrich actionMetadata                        |
| `src/server/api/routers/tokens/procedures/transfer.ts`               | Use `toTokenAmountOutput`                    |
| `src/server/api/routers/hotspots/procedures/createAutomation.ts`     | Add schedule/duration                        |
| `src/server/api/routers/hotspots/procedures/fundAutomation.ts`       | Add additionalDuration                       |
| `src/server/api/routers/welcomePacks/procedures/create.ts`           | Add solAmount/recipientCount                 |
| `src/server/api/routers/governance/procedures/positions/create.ts`   | Use `toTokenAmountOutput`                    |
| `src/server/api/routers/swap/procedures/getInstructions.ts`          | Use `toTokenAmountOutput`                    |
| `src/server/api/routers/governance/procedures/positions/split.ts`    | Use `toTokenAmountOutput`                    |
| `src/server/api/routers/governance/procedures/positions/transfer.ts` | Use `toTokenAmountOutput`                    |

## Not changing

- **Client schema** — `actionMetadata` is already `Record<string, unknown>`, no changes needed
- **DB schema** — `action_metadata` is already a JSON column, no migration needed
- **Procedures with adequate metadata** — `transferHotspot`, `deleteSplit`, `createSplit`, `updateRewardsDestination`, `closeAutomation`, `dataCredits.delegate`, `dataCredits.mint`, voting/proxy/delegation procedures, `welcomePacks.claim`, `welcomePacks.deletePack`, `migration`, `fiat.bankSend`
- **`walletAddress` in actionMetadata** — already available as `payer` on the history response, no need to duplicate
- **`claimRewards` hotspot keys** — would bloat metadata for large claim batches

## Backward compatibility

All changes are additive — new fields in `actionMetadata`. Existing consumers that don't read these fields are unaffected. The one structural change is replacing flat `mint`/`amount` fields with nested `tokenAmount` objects in procedures like `transfer` and `positions.create`. Any frontend code that currently reads `actionMetadata.amount` or `actionMetadata.mint` directly will need to switch to `actionMetadata.tokenAmount.uiAmountString` etc. Since we control both sides and the frontend doesn't currently render these fields (the whole reason for this work), this is safe.

For the classifier, changing from flat `{ mint, amount, tokenName }` to `{ transfers: [...] }` in the generic IDL path is also a structural change. Existing on-chain history entries already stored in the `wallet_history` table retain their old shape. New entries get the new shape. Frontend rendering should handle both (check for `transfers` array first, fall back to flat fields).

## Testing

- Query `GET /api/v1/transactions/history/{payer}` for a wallet with diverse transaction types and verify enriched metadata
- Verify `toTokenAmountOutput` produces correct values for each mint (HNT 8 decimals, IOT 6, MOBILE 6, SOL 9, USDC 6, DC 0)
- Verify classifier correctly resolves token names with corrected mint addresses
- Verify DC mint transactions now include balance change data via the fallback path
- Verify existing history entries with old shapes don't break rendering
