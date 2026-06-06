import { LocaleProvider } from "@/i18n";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CatalogTemplate } from "@turingcare/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressPanel } from "./progress-panel";

vi.mock("@/lib/training-catalog", () => ({
  useTrainingCatalog: vi.fn(),
  findCatalogSkill: vi.fn(),
  useApplyTemplate: vi.fn(),
}));

const sampleCatalog: CatalogTemplate[] = [
  {
    key: "basic-manners",
    name: "Basic Manners",
    description: "Foundational behaviors every dog should know",
    skills: [
      {
        key: "basic-manners.sit",
        name: "Sit",
        description: "Dog reliably sits on cue",
        levels: [
          { level: 1, description: "Lures into a sit with food in a quiet room" },
          { level: 2, description: "Sits without lure in a quiet room" },
          { level: 3, description: "Sits on cue in familiar places" },
          { level: 4, description: "Sits reliably with mild distractions" },
          { level: 5, description: "Sits reliably in any environment" },
        ],
      },
    ],
  },
];

const sampleCatalogSkill = sampleCatalog[0]?.skills[0] ?? null;

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
  catalogSkillKey: string | null;
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
    catalogGoalKey: string | null;
    avgConfidence: number | null;
    skills: TestSkill[];
  }>;
};

const baseProgress = (): TestProgress => ({
  goals: [
    {
      id: "g1",
      goal: "Calm greetings",
      catalogGoalKey: null,
      avgConfidence: 3,
      skills: [
        {
          id: "s1",
          name: "Door-knock threshold",
          confidence: 3,
          position: 0,
          catalogSkillKey: "basic-manners.sit",
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

function setupCatalogMock(catalogSkill: typeof sampleCatalogSkill | null = sampleCatalogSkill) {
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({
    data: sampleCatalog,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof catalogLib.useTrainingCatalog>);
  vi.mocked(catalogLib.findCatalogSkill).mockReturnValue(catalogSkill);
}

function setup(progress = baseProgress()) {
  setupCatalogMock();
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
          catalogSkillKey: null,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

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

    // Expand the skill card before interacting with action buttons
    fireEvent.click(await screen.findByRole("button", { name: /Expand Door-knock threshold/i }));

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
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

    // Expand the skill card before interacting with action buttons
    fireEvent.click(await screen.findByRole("button", { name: /Expand Door-knock threshold/i }));

    fireEvent.click(screen.getByRole("button", { name: "Remove skill" }));

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

describe("SkillCard collapse/expand", () => {
  it("renders the skill name + confidence + level milestone always, action buttons hidden by default", async () => {
    setup();

    // Skill name is always visible
    expect(await screen.findByText("Door-knock threshold")).toBeInTheDocument();
    // Confidence chip is always visible
    expect(screen.getByRole("button", { name: /3\/5/ })).toBeInTheDocument();
    // Action buttons are hidden until expanded
    expect(screen.queryByRole("button", { name: /Log session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit skill$/i })).not.toBeInTheDocument();
  });

  it("clicking the chevron expands the row to show action buttons + sessions", async () => {
    setup();

    await screen.findByText("Door-knock threshold");

    fireEvent.click(screen.getByRole("button", { name: /Expand Door-knock threshold/i }));

    expect(screen.getByRole("button", { name: /Log session/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Edit skill$/i })).toBeInTheDocument();
  });

  it("expanding one skill does not collapse another expanded skill", async () => {
    // Build a progress fixture with two skills
    const twoSkillProgress: TestProgress = {
      goals: [
        {
          id: "g1",
          goal: "Calm greetings",
          catalogGoalKey: null,
          avgConfidence: 3,
          skills: [
            {
              id: "s1",
              name: "Sit",
              confidence: 3,
              position: 0,
              catalogSkillKey: "basic-manners.sit",
              sessionCount: 2,
              firstSessionAt: "2026-05-18T10:00:00.000Z",
              lastSessionAt: "2026-05-20T10:00:00.000Z",
              lastNote: "Held sit",
              sessions: [],
            },
            {
              id: "s2",
              name: "Down",
              confidence: 2,
              position: 1,
              catalogSkillKey: null,
              sessionCount: 1,
              firstSessionAt: "2026-05-19T10:00:00.000Z",
              lastSessionAt: "2026-05-19T10:00:00.000Z",
              lastNote: "Working on it",
              sessions: [],
            },
          ],
        },
      ],
    };

    setupCatalogMock();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = init?.method ?? "GET";
        if (method === "GET" && url.includes("/api/dogs/d1/progress"))
          return jsonResponse(twoSkillProgress);
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

    await screen.findByText("Sit");
    expect(screen.getByText("Down")).toBeInTheDocument();

    // Expand both skills
    fireEvent.click(screen.getByRole("button", { name: /Expand Sit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Expand Down/i }));

    // Both "Log session" buttons should be visible — one per expanded skill
    const logButtons = screen.getAllByRole("button", { name: /Log session/i });
    expect(logButtons).toHaveLength(2);
  });
});
