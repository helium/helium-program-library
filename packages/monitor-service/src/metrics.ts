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
  labelNames: ["name", "address", "type"],
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
