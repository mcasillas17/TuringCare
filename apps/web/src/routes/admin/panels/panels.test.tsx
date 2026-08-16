import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Metrics } from "../use-metrics";
import { FeatureAdoption } from "./feature-adoption";
import { Funnel } from "./funnel";
import { JourneyTimes } from "./journey-times";
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
    activationRate: 0.4,
    returningRate: 0.5,
  },
  signups: [{ day: "2026-05-01", count: 3 }],
  active: [{ day: "2026-05-01", count: 5 }],
  funnel: [{ step: "signup", users: 128 }],
  journeyTimes: [
    {
      step: "signup_to_dog",
      completed: 12,
      medianMinutes: 30,
      p90Minutes: 120,
      within7DaysPct: 90,
    },
  ],
  featureAdoption: [{ feature: "training", users: 12, events: 40 }],
  topPages: [{ path: "/my", views: 90, users: 30 }],
  activityByDay: [{ day: "2026-05-01", category: "training", count: 90 }],
};

it("KpiStrip shows the headline numbers", () => {
  render(<KpiStrip kpis={metrics.kpis} />);
  expect(screen.getByText("128")).toBeInTheDocument();
  expect(screen.getByText(/total owners/i)).toBeInTheDocument();
  expect(screen.getByText("40%")).toBeInTheDocument();
});

it("Funnel renders with empty data without throwing", () => {
  expect(() => render(<Funnel funnel={[]} />)).not.toThrow();
});

it("FeatureAdoption shows grouped product areas instead of raw events", () => {
  render(<FeatureAdoption featureAdoption={metrics.featureAdoption} />);
  expect(screen.getByText("Training")).toBeInTheDocument();
  expect(screen.queryByText("training.practice_logged")).toBeNull();
});

it("TopPages lists paths and counts", () => {
  render(<TopPages topPages={[{ path: "/my", views: 90, users: 30 }]} />);
  expect(screen.getByText("/my")).toBeInTheDocument();
  expect(screen.getByText(/90/)).toBeInTheDocument();
});

it("JourneyTimes renders completion percentiles", () => {
  render(<JourneyTimes journeyTimes={metrics.journeyTimes} />);
  expect(screen.getByText("Signup → dog")).toBeInTheDocument();
  expect(screen.getByText("30m")).toBeInTheDocument();
  expect(screen.getByText("2h")).toBeInTheDocument();
});
