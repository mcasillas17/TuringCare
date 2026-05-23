import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressPanel } from "./progress-panel";

type TestSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
};

type TestSkill = {
  id: string;
  name: string;
  confidence: number;
  position: number;
  sessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  lastNote: string | null;
  sessions: TestSession[];
};

type TestProgress = {
  goals: Array<{
    id: string;
    goal: string;
    avgConfidence: number | null;
    skills: TestSkill[];
  }>;
};

const baseProgress = (): TestProgress => ({
  goals: [
    {
      id: "g1",
      goal: "Calm greetings",
      avgConfidence: 3,
      skills: [
        {
          id: "s1",
          name: "Door-knock threshold",
          confidence: 3,
          position: 0,
          sessionCount: 1,
          firstSessionAt: "2026-05-20T10:00:00.000Z",
          lastSessionAt: "2026-05-20T10:00:00.000Z",
          lastNote: "Stayed calm",
          sessions: [
            {
              id: "p1",
              occurredAt: "2026-05-20T10:00:00.000Z",
              durationMinutes: 12,
              notes: "Stayed calm",
              createdAt: "2026-05-20T10:05:00.000Z",
            },
          ],
        },
      ],
    },
  ],
});

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof Request) return input.url;
  return input.toString();
}

function requestBody(init?: RequestInit) {
  if (typeof init?.body === "string") return JSON.parse(init.body) as Record<string, unknown>;
  return {};
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(progress = baseProgress()) {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      const body = requestBody(init);
      calls.push({ url, method, body });
      const goal = progress.goals[0];
      const skill = goal?.skills[0];
      if (method === "GET" && url.includes("/api/dogs/d1/progress")) return jsonResponse(progress);
      if (method === "PATCH" && skill && url.includes("/api/dogs/d1/skills/s1/confidence")) {
        skill.confidence = Number(body.confidence);
        goal.avgConfidence = skill.confidence;
        return jsonResponse({ skill });
      }
      if (method === "POST" && goal && url.includes("/api/dogs/d1/goals/g1/skills")) {
        const next: TestSkill = {
          id: "s2",
          name: String(body.name),
          confidence: Number(body.confidence),
          position: goal.skills.length,
          sessionCount: 0,
          firstSessionAt: null,
          lastSessionAt: null,
          lastNote: null,
          sessions: [],
        };
        goal.skills.push(next);
        return jsonResponse({ skill: next });
      }
      if (method === "POST" && skill && url.includes("/api/dogs/d1/skills/s1/sessions")) {
        const next: TestSession = {
          id: "p2",
          occurredAt: String(body.occurredAt),
          durationMinutes: Number(body.durationMinutes),
          notes: String(body.notes),
          createdAt: "2026-05-22T10:05:00.000Z",
        };
        skill.sessions.unshift(next);
        skill.sessionCount += 1;
        skill.lastSessionAt = next.occurredAt;
        skill.lastNote = next.notes;
        return jsonResponse({ session: next });
      }
      if (method === "DELETE" && goal && url.includes("/api/dogs/d1/skills/s1")) {
        goal.skills = goal.skills.filter((s) => s.id !== "s1");
        goal.avgConfidence = goal.skills.length ? (goal.skills[0]?.confidence ?? null) : null;
        return jsonResponse({ ok: true });
      }
      return jsonResponse({});
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ProgressPanel dogId="d1" />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("ProgressPanel", () => {
  it("renders a goal, default skill, and confidence chip", async () => {
    setup();

    expect(await screen.findByText("Training progress")).toBeInTheDocument();
    expect(await screen.findByText("Calm greetings")).toBeInTheDocument();
    expect(screen.getByText("Door-knock threshold")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3\/5/ })).toBeInTheDocument();
  });

  it("updates confidence from the chip menu", async () => {
    const { calls } = setup();

    fireEvent.click(await screen.findByRole("button", { name: /3\/5/ }));
    expect(await screen.findByRole("button", { name: "Usually" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usually" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "PATCH" && c.url.includes("/confidence"))).toBe(true),
    );
    expect(await screen.findByRole("button", { name: /4\/5/ })).toBeInTheDocument();
  });

  it("adds a skill and shows it after refetch", async () => {
    const { calls } = setup();

    fireEvent.click(await screen.findByRole("button", { name: "Add skill" }));
    fireEvent.change(screen.getByLabelText("Skill name"), {
      target: { value: "Greeting strangers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/goals/g1/skills"))).toBe(
        true,
      ),
    );
    expect(await screen.findByText("Greeting strangers")).toBeInTheDocument();
  });

  it("logs a session and increments the session count", async () => {
    const { calls } = setup();

    fireEvent.click(await screen.findByRole("button", { name: "Log session" }));
    fireEvent.change(screen.getByLabelText("Duration (min)"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Relaxed after one bark" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save session" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/sessions"))).toBe(true),
    );
    expect(await screen.findByText(/2 sessions/)).toBeInTheDocument();
  });

  it("removes a skill and refetches the progress", async () => {
    const { calls } = setup();

    fireEvent.click(await screen.findByRole("button", { name: "Remove skill" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/skills/s1"))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText("Door-knock threshold")).not.toBeInTheDocument());
  });

  it("renders the empty state", async () => {
    setup({ goals: [] });

    expect(
      await screen.findByText("No training goals yet — add one in the Goals section above."),
    ).toBeInTheDocument();
  });
});
