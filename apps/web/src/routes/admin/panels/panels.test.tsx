import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Metrics } from "../use-metrics";
import { FeatureUsage } from "./feature-usage";
import { Funnel } from "./funnel";
import { KpiStrip } from "./kpi-strip";
import { TopPages } from "./top-pages";

const metrics: Metrics = {
  rangeDays: 30,
  kpis: {
    totalUsers: 128,
    newUsers: 14,
    dau: 9,
    wau: 41,
    mau: 60,
    stickiness: 0.15,
    eventCount: 2100,
  },
  signups: [{ day: "2026-05-01", count: 3 }],
  active: [{ day: "2026-05-01", count: 5 }],
  eventVolume: [{ name: "page.viewed", count: 1900 }],
  funnel: [{ step: "signup", users: 128 }],
  topPages: [{ path: "/my", count: 90 }],
  eventsByDay: [{ day: "2026-05-01", name: "page.viewed", count: 90 }],
};

it("KpiStrip shows the headline numbers", () => {
  render(<KpiStrip kpis={metrics.kpis} />);
  expect(screen.getByText("128")).toBeInTheDocument();
  expect(screen.getByText(/total users/i)).toBeInTheDocument();
  expect(screen.getByText("15%")).toBeInTheDocument();
});

it("Funnel renders with empty data without throwing", () => {
  expect(() => render(<Funnel funnel={[]} />)).not.toThrow();
});

it("FeatureUsage lists events and excludes page.viewed", () => {
  render(
    <FeatureUsage
      eventVolume={[
        { name: "page.viewed", count: 1900 },
        { name: "dog.created", count: 12 },
      ]}
    />,
  );
  expect(screen.getByText("dog.created")).toBeInTheDocument();
  expect(screen.queryByText("page.viewed")).toBeNull();
});

it("TopPages lists paths and counts", () => {
  render(<TopPages topPages={[{ path: "/my", count: 90 }]} />);
  expect(screen.getByText("/my")).toBeInTheDocument();
  expect(screen.getByText("90")).toBeInTheDocument();
});
