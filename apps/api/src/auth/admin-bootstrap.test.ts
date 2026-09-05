import { describe, expect, it, vi } from "vitest";
import { resolveAdminRole } from "./admin-bootstrap";

describe("resolveAdminRole", () => {
  it("returns existing role and does NOT write when email is not on the allowlist", async () => {
    const update = vi.fn();
    const db = { update } as unknown as NonNullable<
      Parameters<typeof resolveAdminRole>[1]
    >["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "nobody@example.com", role: "user", emailVerified: true },
      { database: db, adminEmails: ["admin@x.com"] },
    );
    expect(role).toBe("user");
    expect(update).not.toHaveBeenCalled();
  });

  it("promotes (DB write) and returns 'admin' when on allowlist and role is user", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "u1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update } as unknown as NonNullable<
      Parameters<typeof resolveAdminRole>[1]
    >["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "Admin@X.com", role: "user", emailVerified: true },
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
      { id: "u1", email: "admin@x.com", role: "admin", emailVerified: true },
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
      { id: "u1", email: "x@y.com", emailVerified: true },
      { database: db, adminEmails: [] },
    );
    expect(role).toBe("user");
    expect(update).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    "never promotes or authorizes a non-verified account (%s)",
    async (emailVerified) => {
      const update = vi.fn();
      const database = { update } as unknown as NonNullable<
        Parameters<typeof resolveAdminRole>[1]
      >["database"];
      for (const role of ["user", "admin"]) {
        expect(
          await resolveAdminRole(
            { id: "u1", email: "admin@x.com", role, emailVerified },
            { database, adminEmails: ["admin@x.com"] },
          ),
        ).toBe("user");
      }
      expect(update).not.toHaveBeenCalled();
    },
  );
});
