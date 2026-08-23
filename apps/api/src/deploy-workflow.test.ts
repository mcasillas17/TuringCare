import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const deployWorkflowUrl = new URL("../../../.github/workflows/deploy.yml", import.meta.url);

describe("production deployment protocol", () => {
  it("applies compatible migrations, deploys the API, then applies migration 0014", async () => {
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
});
