import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const deployWorkflowUrl = new URL("../../../.github/workflows/deploy.yml", import.meta.url);

describe("production deployment protocol", () => {
  it("bounds competing workspace test pools in CI and predeploy validation", async () => {
    for (const name of ["ci", "deploy"]) {
      const workflow = await readFile(
        new URL(`../../../.github/workflows/${name}.yml`, import.meta.url),
        "utf8",
      );
      expect(workflow).toMatch(/^\s+run: pnpm -r --workspace-concurrency=1 test --maxWorkers=2$/m);
    }
  });

  it("queues complete production rollouts instead of cancelling or interleaving them", async () => {
    const workflow = await readFile(deployWorkflowUrl, "utf8");
    const workflowConcurrency = workflow.match(
      /\nconcurrency:\n(?<body>[\s\S]*?)(?=\n(?:jobs|env|permissions):\n)/,
    )?.groups?.body;

    expect(workflowConcurrency).toContain("group: production-deploy");
    expect(workflowConcurrency).toContain("cancel-in-progress: false");
  });

  it("drains, applies compatible migrations, deploys the API, then applies the migration tail", async () => {
    const workflow = await readFile(deployWorkflowUrl, "utf8");
    const deployApi = workflow.match(/\n {2}deploy-api:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/)
      ?.groups?.body;
    const migrate = workflow.match(/\n {2}migrate:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/)
      ?.groups?.body;

    expect(deployApi).toContain("needs: ci");
    expect(deployApi).toContain("flyctl scale count 0");
    expect(deployApi).toContain("db:migrate:predeploy");
    expect(deployApi).toContain("flyctl deploy");
    expect(deployApi).toContain('SENTRY_RELEASE="$GITHUB_SHA"');
    expect(deployApi).toContain("/ready");
    expect(migrate).toContain("needs: deploy-api");
    expect(migrate).toContain("db:migrate");
    expect(workflow.indexOf("  deploy-api:")).toBeLessThan(workflow.indexOf("  migrate:"));
  });

  it("publishes the web only after the compatible API and final migration succeed", async () => {
    const workflow = await readFile(deployWorkflowUrl, "utf8");
    const deployWeb = workflow.match(
      /\n {2}deploy-web:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n|$)/,
    )?.groups?.body;

    expect(deployWeb).toContain("needs: migrate");
    expect(deployWeb).not.toContain("needs: ci");
  });

  it.each(["ci", "deploy"])("gates %s on the monitoring-enabled production image", async (name) => {
    const workflow = await readFile(
      new URL(`../../../.github/workflows/${name}.yml`, import.meta.url),
      "utf8",
    );
    const ci = workflow.match(/\n {2}ci:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/)?.groups?.body;

    expect(ci).toContain("docker build --file Dockerfile.api");
    expect(ci).toContain("scripts/smoke-api-image.sh");

    const smoke = await readFile(
      new URL("../../../scripts/smoke-api-image.sh", import.meta.url),
      "utf8",
    );
    expect(smoke).toContain("smoke-api-monitoring-image.sh");
  });
});
