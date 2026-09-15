---
"@helium/tuktuk-dca-service": patch
---

Bind the DCA swap endpoint to the task and queue named by the DCA account: the request's task, task_queue and task_queued_at must match next_task, task_queue and queued_at, and the swap payer is derived from the account's task queue.
