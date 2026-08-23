import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const deployWorkflowUrl = new URL("../../../.github/workflows/deploy.yml", import.meta.url);

describe("production deployment protocol", () => {
  it("queues complete production rollouts instead of cancelling or interleaving them", async () => {
    const workflow = await readFile(deployWorkflowUrl, "utf8");
    const workflowConcurrency = workflow.match(
      /\nconcurrency:\n(?<body>[\s\S]*?)(?=\n(?:jobs|env|permissions):\n)/,
    )?.groups?.body;

    expect(workflowConcurrency).toContain("group: production-deploy");
    expect(workflowConcurrency).toContain("cancel-in-progress: false");
  });

  it("applies compatible migrations, deploys the API, then applies post-deploy migrations", async () => {
    const workflow = await readFile(deployWorkflowUrl, "utf8");
    const migrateCompatible = workflow.match(
      /\n {2}migrate-compatible:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/,
    )?.groups?.body;
    const deployApi = workflow.match(/\n {2}deploy-api:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/)
      ?.groups?.body;
    const migrate = workflow.match(/\n {2}migrate:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/)
      ?.groups?.body;

    expect(migrateCompatible).toContain("needs: ci");
    expect(migrateCompatible).toContain("db:migrate:predeploy");
    expect(deployApi).toContain("needs: migrate-compatible");
    expect(deployApi).toContain("--strategy rolling");
    expect(migrate).toContain("needs: deploy-api");
    expect(workflow.indexOf("  migrate-compatible:")).toBeLessThan(
      workflow.indexOf("  deploy-api:"),
    );
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

  it("smoke-tests the production API image before rollout", async () => {
    const workflow = await readFile(deployWorkflowUrl, "utf8");
    const ci = workflow.match(/\n {2}ci:\n(?<body>[\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/)?.groups?.body;

    expect(ci).toContain("docker build --file Dockerfile.api");
    expect(ci).toContain("scripts/smoke-api-image.sh");
  });
});
