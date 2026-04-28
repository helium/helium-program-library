# crons

This docker container is deprecated and has been replaced with tuktuk jobs. We keep the code around in case there are issues with tuktuk, but for the most part there haven't been any.

Each script is a standalone entrypoint under `src/`; they're typically invoked from CronJobs, not a long-running service.

## Running a single script

```sh
pnpm ts-node src/<script>.ts
```

> The Dockerfile is published as `public.ecr.aws/v0j6k5v6/crons` for use as a base image by downstream CronJobs, but there's no deployment of the `crons` image in [helium-foundation-k8s](https://github.com/helium/helium-foundation-k8s) today — individual cron scripts are generally packaged with the service they maintain.
