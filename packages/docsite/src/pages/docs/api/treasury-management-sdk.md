# Treasury Management SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initialize_treasury_management_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| treasury_management      | immut      | no     |      |
| treasury_mint            | immut      | no     |      |
| supply_mint              | immut      | no     |      |
| mint_authority           | immut      | no     |      |
| circuit_breaker          | immut      | no     |      |
| treasury                 | immut      | no     |      |
| system_program           | immut      | no     |      |
| circuit_breaker_program  | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| token_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### redeem_v0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| treasury_management     | immut      | no     |      |
| treasury_mint           | immut      | no     |      |
| supply_mint             | immut      | no     |      |
| treasury                | immut      | no     |      |
| circuit_breaker         | immut      | no     |      |
| from                    | immut      | no     |      |
| to                      | immut      | no     |      |
| owner                   | immut      | no     |      |
| circuit_breaker_program | immut      | no     |      |
| token_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_treasury_management_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| treasury_management | immut      | no     |      |
| authority           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### AccountWindowedCircuitBreakerV0

undefined

### TreasuryManagementV0

undefined

## Types

### AccountWindowedCircuitBreakerV0

| Field         | Type            |
| ------------- | --------------- |
| token_account | pubkey          |
| authority     | pubkey          |
| owner         | pubkey          |
| config        | [object Object] |
| last_window   | [object Object] |
| bump_seed     | u8              |

### Curve

| Variant            | Fields  |
| ------------------ | ------- |
| ExponentialCurveV0 | k: u128 |

### InitializeTreasuryManagementArgsV0

| Field            | Type            |
| ---------------- | --------------- |
| authority        | pubkey          |
| curve            | [object Object] |
| freeze_unix_time | i64             |
| window_config    | [object Object] |

### RedeemArgsV0

| Field                  | Type |
| ---------------------- | ---- |
| amount                 | u64  |
| expected_output_amount | u64  |

### TreasuryManagementV0

| Field            | Type            |
| ---------------- | --------------- |
| treasury_mint    | pubkey          |
| supply_mint      | pubkey          |
| authority        | pubkey          |
| treasury         | pubkey          |
| curve            | [object Object] |
| freeze_unix_time | i64             |
| bump_seed        | u8              |

### UpdateTreasuryManagementArgsV0

| Field            | Type            |
| ---------------- | --------------- |
| authority        | pubkey          |
| curve            | [object Object] |
| freeze_unix_time | i64             |

### WindowV0

| Field                 | Type |
| --------------------- | ---- |
| last_aggregated_value | u64  |
| last_unix_timestamp   | i64  |

### circuit_breaker::state::ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### circuit_breaker::state::WindowedCircuitBreakerConfigV0

| Field               | Type            |
| ------------------- | --------------- |
| window_size_seconds | u64             |
| threshold_type      | [object Object] |
| threshold           | u64             |

### treasury_management::circuit_breaker::ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### treasury_management::circuit_breaker::WindowedCircuitBreakerConfigV0

| Field               | Type            |
| ------------------- | --------------- |
| window_size_seconds | u64             |
| threshold_type      | [object Object] |
| threshold           | u64             |
