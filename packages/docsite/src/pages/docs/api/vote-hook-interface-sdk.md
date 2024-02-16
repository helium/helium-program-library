# Vote Hook Interface SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### onVoteV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| voter           | immut      | no     |      |
| voteController  | immut      | yes    |      |
| stateController | mut        | no     |      |
| proposal        | immut      | yes    |      |
| proposalConfig  | immut      | no     |      |

#### Args

| Name | Type       | Docs |
| ---- | ---------- | ---- |
| args | VoteArgsV0 |      |

## Accounts

## Types

### VoteArgsV0

| Field      | Type |
| ---------- | ---- |
| choice     | u16  |
| weight     | u128 |
| removeVote | bool |
