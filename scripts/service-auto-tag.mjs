/**
 * Names the next `docker-<env>-<service>-<x.y.z>` tag for each opted-in service
 * that changed since its last tag.
 *
 * A tag makes an ECR image and deploys nothing, so there is no opt-out per
 * merge. People still push hand tags from any branch, which is the hotfix path
 * and the way to set a minor or a major. So "last" is the highest version of
 * the service in the whole repo, not the newest tag on develop: the bot
 * continues from a hand tag and never lands on a version a branch already took.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compareVersions = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

/**
 * @param {{
 *   dockerInfo: object,
 *   tags: string[],
 *   usesTurboPrune: (path: string) => boolean,
 *   workspaceChanged: (path: string, tag: string) => boolean,
 *   pathChanged: (path: string, tag: string) => boolean,
 * }} input `dockerInfo` is `docker-info.json`. `tags` is every tag in the repo.
 * @returns {{ tags: object[], unchanged: object[], skipped: { service: string, reason: string }[] }}
 */
export const serviceAutoTag = ({
  dockerInfo,
  tags,
  usesTurboPrune,
  workspaceChanged,
  pathChanged,
}) => {
  const { autoTag, ...envs } = dockerInfo;
  const result = { tags: [], unchanged: [], skipped: [] };

  for (const service of autoTag) {
    const env = Object.keys(envs).find((name) =>
      Object.hasOwn(envs[name], service),
    );
    // `docker-push.yaml` has no guard for a name it cannot find: the tag would
    // build from the path `null`.
    if (!env) {
      result.skipped.push({ service, reason: "not in docker-info.json" });
      continue;
    }
    const servicePath = envs[env][service];

    // Exactly `docker-<env>-<service>-<x>.<y>.<z>`: the repo carries a
    // `-0.1.11-test` tag that a looser pattern would read as a version.
    const pattern = new RegExp(
      `^docker-[a-z]+-${escape(service)}-(\\d+)\\.(\\d+)\\.(\\d+)$`,
    );
    const last = tags
      .map((tag) => ({
        tag,
        version: tag.match(pattern)?.slice(1).map(Number),
      }))
      .filter(({ version }) => version)
      .sort((a, b) => compareVersions(a.version, b.version))
      .at(-1);
    // The first tag stays manual: it is the person's choice of a first version.
    if (!last) {
      result.skipped.push({ service, reason: "no docker tag yet" });
      continue;
    }

    const lastTag = last.tag;
    const [major, minor, patch] = last.version;
    // The test `docker-push.yaml` uses for the build context. A `turbo prune`
    // image builds from workspace source, so a workspace dependency rebuilds
    // it. Any other image builds from its own directory.
    const rule = usesTurboPrune(servicePath) ? "workspace" : "path";
    const changed =
      rule === "workspace"
        ? workspaceChanged(servicePath, lastTag)
        : pathChanged(servicePath, lastTag);
    if (!changed) {
      result.unchanged.push({ service, lastTag, rule });
      continue;
    }

    result.tags.push({
      service,
      env,
      path: servicePath,
      lastTag,
      tag: `docker-${env}-${service}-${major}.${minor}.${patch + 1}`,
      rule,
    });
  }

  return result;
};

const RULE_TEXT = {
  workspace: "its path or a workspace dependency changed",
  path: "its path changed",
};

/** The run summary: one row per opted-in service. */
export const report = ({ tags, unchanged, skipped }) =>
  [
    "| service | result | why |",
    "| --- | --- | --- |",
    ...tags.map(
      ({ service, tag, lastTag, rule }) =>
        `| ${service} | \`${tag}\` | ${RULE_TEXT[rule]} since \`${lastTag}\` |`,
    ),
    ...unchanged.map(
      ({ service, lastTag }) =>
        `| ${service} | no tag | no change since \`${lastTag}\` |`,
    ),
    ...skipped.map(
      ({ service, reason }) => `| ${service} | skipped | ${reason} |`,
    ),
  ].join("\n");

const USAGE = "Usage: node scripts/service-auto-tag.mjs";

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

const main = (argv) => {
  if (argv.length) throw new Error(USAGE);

  const result = serviceAutoTag({
    dockerInfo: JSON.parse(fs.readFileSync("docker-info.json", "utf8")),
    tags: run("git", ["tag", "-l", "docker-*"]).split("\n").filter(Boolean),
    usesTurboPrune: (servicePath) => {
      const dockerfile = path.join(servicePath, "Dockerfile");
      return (
        fs.existsSync(dockerfile) &&
        fs.readFileSync(dockerfile, "utf8").includes("turbo prune")
      );
    },
    // pnpm maps each changed file to the package that holds it, then adds the
    // packages that depend on it. A root file (`pnpm-lock.yaml`, `turbo.json`,
    // the root `package.json`, a workflow) maps to the root package, which no
    // service depends on, so it never marks one.
    workspaceChanged: (servicePath, tag) => {
      const { name } = JSON.parse(
        fs.readFileSync(path.join(servicePath, "package.json"), "utf8"),
      );
      // pnpm prints nothing, not `[]`, when no package matches the filter.
      const affected = JSON.parse(
        run("pnpm", [
          "--filter",
          `...[${tag}]`,
          "--changed-files-ignore-pattern=**/*.md",
          "list",
          "--depth",
          "-1",
          "--json",
        ]).trim() || "[]",
      );
      return affected.some((pkg) => pkg.name === name);
    },
    // A README or other Markdown change builds no different image.
    pathChanged: (servicePath, tag) =>
      run("git", [
        "diff",
        "--name-only",
        tag,
        "HEAD",
        "--",
        servicePath,
        ":(exclude,glob)**/*.md",
      ]) !== "",
  });

  for (const { service, reason } of result.skipped) {
    process.stderr.write(`skipped ${service}: ${reason}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report(result)}\n`);
  }
  // stdout carries the result alone: the workflow reads it with `jq`.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
