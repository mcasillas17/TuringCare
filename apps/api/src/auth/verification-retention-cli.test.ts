import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRateLimitTestDatabase } from "../test-rate-limit-db";

const exec = promisify(execFile);
let fixture: Awaited<ReturnType<typeof createRateLimitTestDatabase>>;
beforeEach(async () => {
  fixture = await createRateLimitTestDatabase();
});
afterEach(async () => {
  await fixture.cleanup();
});

async function runCli() {
  try {
    const output = await exec(
      process.execPath,
      ["--import", "tsx", "src/telemetry/retention-cli.ts"],
      {
        env: { ...process.env, DATABASE_URL: fixture.connectionString },
      },
    );
    return { code: 0, ...output };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 1 &&
      "stdout" in error &&
      typeof error.stdout === "string" &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return { code: 1, stdout: error.stdout, stderr: error.stderr };
    }
    throw error;
  }
}

describe("retention CLI operational evidence", () => {
  it("exits nonzero for an exhausted scan budget, then resumes to completion", async () => {
    await fixture.pool.query(`
      insert into rate_limit (id, key, count, last_request)
      select 'verification:credential:' || lpad(to_hex(i), 64, '0'),
        'verification:credential:' || lpad(to_hex(i), 64, '0'), 1,
        floor(extract(epoch from clock_timestamp()) * 1000)::bigint
      from generate_series(1, 50100) i`);
    const first = await runCli();
    expect(first.code).toBe(1);
    expect(first.stdout).toContain("scanned: 50000");
    expect(first.stderr).toContain("budget_exhausted");
    expect(first.stderr).not.toContain(fixture.name);
    const second = await runCli();
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("complete: true");
    expect(second.stdout).toContain("scanned: 101");
    console.info("[retention-cli-evidence]", { firstExit: first.code, resumedExit: second.code });
  }, 15_000);

  it("reports bounded SQLSTATE classification without SQL, keys, or raw error text", async () => {
    await fixture.pool.query("drop table events");
    const result = await runCli();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("database_error");
    expect(result.stderr).toContain("42P01");
    expect(result.stderr).not.toContain("delete from");
    expect(result.stderr).not.toContain("does not exist");
    expect(result.stderr).not.toContain(fixture.name);
  });
});
