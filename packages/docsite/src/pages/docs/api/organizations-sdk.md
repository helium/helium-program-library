# Organizations SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeOrganizationV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| payer         | mut        | yes    |      |
| organization  | mut        | no     |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type                         | Docs |
| ---- | ---------------------------- | ---- |
| args | InitializeOrganizationArgsV0 |      |

### initializeProposalV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | mut        | yes    |      |
| authority       | immut      | yes    |      |
| proposal        | mut        | no     |      |
| proposalConfig  | immut      | no     |      |
| organization    | mut        | no     |      |
| proposalProgram | immut      | no     |      |
| systemProgram   | immut      | no     |      |

#### Args

| Name | Type                     | Docs |
| ---- | ------------------------ | ---- |
| args | InitializeProposalArgsV0 |      |

## Accounts

### OrganizationV0

| Field                 | Type      |
| --------------------- | --------- |
| numProposals          | u32       |
| authority             | publicKey |
| defaultProposalConfig | publicKey |
| proposalProgram       | publicKey |
| name                  | string    |
| bumpSeed              | u8        |

## Types

### Choice

| Field  | Type   |
| ------ | ------ |
| weight | u128   |
| name   | string |
| uri    | string |

### InitializeOrganizationArgsV0

| Field                 | Type      |
| --------------------- | --------- |
| name                  | string    |
| authority             | publicKey |
| defaultProposalConfig | publicKey |
| proposalProgram       | publicKey |

### ChoiceArg

| Field | Type   |
| ----- | ------ |
| name  | string |
| uri   | string |

### InitializeProposalArgsV0

| Field              | Type      |
| ------------------ | --------- |
| seed               | bytes     |
| name               | string    |
| uri                | string    |
| maxChoicesPerVoter | u16       |
| choices            | ChoiceArg |
| tags               | string    |
