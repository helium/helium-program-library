# @helium/currency-utils

Decimal/lamport conversion helpers and Pyth price-feed utilities used across the Helium SDKs. Wraps Pyth receiver reads and handles the common "amount in bn, UI amount, price-scaled amount" juggling.

This is mostly just used by wallet-app and builder-app as a thin wrapper around pyth for legacy reasons.