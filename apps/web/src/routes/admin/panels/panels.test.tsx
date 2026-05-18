import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Activity, Metrics } from "../use-metrics";
import { ActivityFeed } from "./activity-feed";
import { KpiStrip } from "./kpi-strip";

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
};

it("KpiStrip shows the headline numbers", () => {
  render(<KpiStrip kpis={metrics.kpis} />);
  expect(screen.getByText("128")).toBeInTheDocument();
  expect(screen.getByText(/total users/i)).toBeInTheDocument();
});

it("ActivityFeed lists events", () => {
  const activity: Activity = {
    items: [
      {
        id: "1",
        name: "user.signed_in",
        userId: "abcdef123",
        createdAt: "2026-05-17T10:00:00+00",
        props: {},
      },
    ],
  };
  render(<ActivityFeed activity={activity} />);
  expect(screen.getByText("user.signed_in")).toBeInTheDocument();
});
