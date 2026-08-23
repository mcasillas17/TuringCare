import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageViewTracker } from "./track";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("posts a page.viewed event for the current path", async () => {
  render(
    <MemoryRouter initialEntries={["/my"]}>
      <PageViewTracker />
      <Routes>
        <Route path="/my" element={<div>app</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/events"),
    expect.objectContaining({ method: "POST", credentials: "include" }),
  );
  const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
  const body = JSON.parse(firstCall[1].body as string);
  expect(body).toEqual({ name: "page.viewed", props: { path: "/my" } });
});

it("redacts a public Brief token from page-view telemetry", () => {
  render(
    <MemoryRouter initialEntries={["/b/super-secret-token"]}>
      <PageViewTracker />
      <Routes>
        <Route path="/b/:token" element={<div>shared Brief</div>} />
      </Routes>
    </MemoryRouter>,
  );

  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
  const serializedBody = firstCall[1].body as string;

  expect(JSON.parse(serializedBody)).toEqual({
    name: "page.viewed",
    props: { path: "/b/:token" },
  });
  expect(serializedBody).not.toContain("super-secret-token");
});

it("redacts a case-variant public Brief token from page-view telemetry", () => {
  render(
    <MemoryRouter initialEntries={["/B/super-secret-token"]}>
      <PageViewTracker />
      <Routes>
        <Route path="/b/:token" element={<div>shared Brief</div>} />
      </Routes>
    </MemoryRouter>,
  );

  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
  const serializedBody = firstCall[1].body as string;

  expect(JSON.parse(serializedBody)).toEqual({
    name: "page.viewed",
    props: { path: "/b/:token" },
  });
  expect(serializedBody).not.toContain("super-secret-token");
});

it("fires a new page.viewed on route change", async () => {
  render(
    <MemoryRouter initialEntries={["/my"]}>
      <PageViewTracker />
      <Routes>
        <Route path="/my" element={<Link to="/other">go</Link>} />
        <Route path="/other" element={<div>other</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  await userEvent.click(screen.getByRole("link", { name: "go" }));
  const paths = fetchMock.mock.calls.map(
    (c) => JSON.parse((c as [string, RequestInit])[1].body as string).props.path,
  );
  expect(paths).toContain("/my");
  expect(paths).toContain("/other");
});

it("swallows fetch failures without throwing", () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  expect(() =>
    render(
      <MemoryRouter initialEntries={["/my"]}>
        <PageViewTracker />
        <Routes>
          <Route path="/my" element={<div>app</div>} />
        </Routes>
      </MemoryRouter>,
    ),
  ).not.toThrow();
});
