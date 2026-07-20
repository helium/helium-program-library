# hpl-crons

Stores on-chain "do this Helium action at time T" entries that the [tuktuk](https://github.com/helium/tuktuk) cranker picks up and executes — epoch rollovers, rewards claims, DC auto-top-ups, mini-fanout distributions, Pyth price refreshes, voter-position renewals. This program only describes the scheduled work; the cranker is what actually fires CPIs. You use this program to schedule tuktuk actions, since not just anyone can publish to the hpl-crons queue (a queue gives permissions to spend sol from the queue). These endpoints ensure that any action is SOL neutral as far as the queue is concerned.

SDK: [`@helium/hpl-crons-sdk`](../../packages/hpl-crons-sdk).

Release / upgrade: push a `program-hpl-crons-<version>` git tag.
