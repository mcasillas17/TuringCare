import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
    <MemoryRouter initialEntries={["/app"]}>
      <PageViewTracker />
      <Routes>
        <Route path="/app" element={<div>app</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/events"),
    expect.objectContaining({ method: "POST" }),
  );
  const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
  const body = JSON.parse(firstCall[1].body as string);
  expect(body).toEqual({ name: "page.viewed", props: { path: "/app" } });
});
