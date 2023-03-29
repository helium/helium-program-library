import client from "prom-client";

// Create a Registry which registers the metrics
export const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'solana-monitor'
})

export const supplyGauge = new client.Gauge({
  name: "solana_mint_supply",
  help: "Supply of this mint",
  labelNames: ["name"],
});
register.registerMetric(supplyGauge);

export const tokenBalanceGauge = new client.Gauge({
  name: "solana_account_token_balance",
  help: "Balance of this token account",
  labelNames: ["name"],
});
register.registerMetric(tokenBalanceGauge);

export const solBalanceGauge = new client.Gauge({
  name: "solana_account_sol_balance",
  help: "Sol balance of this account",
  labelNames: ["name"],
});
register.registerMetric(solBalanceGauge);

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