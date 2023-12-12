import client from "prom-client";

// Create a Registry which registers the metrics
export const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "solana-monitor",
});

export const supplyGauge = new client.Gauge({
  name: "solana_mint_supply",
  help: "Supply of this mint",
  labelNames: ["name", "address"],
});
register.registerMetric(supplyGauge);

export const balanceGauge = new client.Gauge({
  name: "solana_account_balance",
  help: "Balance of this account",
  labelNames: ["name", "address", "type", "is_maker"],
});
register.registerMetric(balanceGauge);

export const circuitBreakerLimitGauge = new client.Gauge({
  name: "solana_circuit_breaker_limit",
  help: "The limit of this circuit breaker",
  labelNames: ["name"],
});
register.registerMetric(circuitBreakerLimitGauge);

export const circuitBreakerLevel = new client.Gauge({
  name: "solana_circuit_breaker_level",
  help: "The current level of this circuit breaker",
  labelNames: ["name"],
});
register.registerMetric(circuitBreakerLevel);

export const totalRewardsGauge = new client.Gauge({
  name: 'helium_recipient_total_rewards',
  help: 'The total rewards claimed in all recipients',
  labelNames:  ['dnt_mint']
})
register.registerMetric(totalRewardsGauge);

export const realVeTokensGauge = new client.Gauge({
  name: "helium_real_delegated_ve_tokens",
  help: "The total ve tokens for this mint in sql",
  labelNames: ["dnt_mint"],
});
register.registerMetric(realVeTokensGauge);

export const approxVeTokensGauge = new client.Gauge({
  name: "helium_approx_delegated_ve_tokens",
  help: "The total ve tokens for this mint on-chain",
  labelNames: ["dnt_mint"],
});
register.registerMetric(approxVeTokensGauge);

export const realFallRateGauge = new client.Gauge({
  name: "helium_real_delegated_fall_rate",
  help: "The total ve tokens fall rate for this mint in sql",
  labelNames: ["dnt_mint"],
});
register.registerMetric(realFallRateGauge);

export const approxFallRateGauge = new client.Gauge({
  name: "helium_approx_delegated_fall_rate",
  help: "The total ve tokens fall rate for this mint on-chain",
  labelNames: ["dnt_mint"],
});
register.registerMetric(approxFallRateGauge);

export const delegationsGauge = new client.Gauge({
  name: "helium_delegations",
  help: "The total number of delegations",
  labelNames: ["dnt_mint"],
});
register.registerMetric(delegationsGauge);

