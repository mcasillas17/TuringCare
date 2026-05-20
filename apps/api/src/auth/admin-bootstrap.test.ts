import { describe, expect, it, vi } from "vitest";
import { resolveAdminRole } from "./admin-bootstrap";

describe("resolveAdminRole", () => {
  it("returns existing role and does NOT write when email is not on the allowlist", async () => {
    const update = vi.fn();
    const db = { update } as unknown as NonNullable<
      Parameters<typeof resolveAdminRole>[1]
    >["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "nobody@example.com", role: "user" },
      { database: db, adminEmails: ["admin@x.com"] },
    );
    expect(role).toBe("user");
    expect(update).not.toHaveBeenCalled();
  });

  it("promotes (DB write) and returns 'admin' when on allowlist and role is user", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update } as unknown as NonNullable<
      Parameters<typeof resolveAdminRole>[1]
    >["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "Admin@X.com", role: "user" },
      { database: db, adminEmails: ["admin@x.com"] },
    );
    expect(role).toBe("admin");
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ role: "admin" });
  });

  it("is idempotent: already admin on allowlist → no DB write", async () => {
    const update = vi.fn();
    const db = { update } as unknown as NonNullable<
      Parameters<typeof resolveAdminRole>[1]
    >["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "admin@x.com", role: "admin" },
      { database: db, adminEmails: ["admin@x.com"] },
    );
    expect(role).toBe("admin");
    expect(update).not.toHaveBeenCalled();
  });

  it("defaults missing role to 'user'", async () => {
    const update = vi.fn();
    const db = { update } as unknown as NonNullable<
      Parameters<typeof resolveAdminRole>[1]
    >["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "x@y.com" },
      { database: db, adminEmails: [] },
    );
    expect(role).toBe("user");
    expect(update).not.toHaveBeenCalled();
  });
});
