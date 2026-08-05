---
"@helium/distributor-oracle": patch
---

Fix `/metrics` 500ing with "column reward_index.address must appear in the GROUP BY clause": the dao filter join added to `getTotalRewards` made Sequelize select the primary key and joined columns alongside the `SUM` aggregate. Exclude the join's attributes and query raw so only the aggregate is selected.
