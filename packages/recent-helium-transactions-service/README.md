# recent-helium-transactions-service

Service that exposes a REST + websocket feed of recent Helium-program transactions so wallets/dashboards can show activity without round-tripping to the RPC for every refresh.

> Currently has a Dockerfile but **is not deployed** in [helium-foundation-k8s](https://github.com/helium/helium-foundation-k8s) as of this writing. Deploy would use the tag `docker-web-recent-helium-transactions-service-<version>`.

Note that this was built as a prototype and never actually used.
