/**
 * @vitest-environment jsdom
 */

// S18 L2 Slice 3 (hygiene): FactoryApp must default to the REAL backend, and
// when mock mode really is active (prop + env flag) the operator must see a
// DEMO DATA banner — demo numbers must never masquerade as factory truth.
//
// Placed under pages/__tests__ because the lane write scope covers
// src/factory/{state,pages,components,api}/** + FactoryApp.tsx.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../Dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard-stub" />,
}));
vi.mock("../JobDetail", () => ({
  JobDetail: () => <div data-testid="jobdetail-stub" />,
}));

import { FactoryApp } from "../../FactoryApp";
import { disableMockApi } from "../../api/mockData";

describe("FactoryApp — mock mode hygiene (S18 L2 Slice 3)", () => {
  afterEach(() => {
    cleanup();
    disableMockApi();
    vi.unstubAllEnvs();
  });

  it("defaults to the real API — no DEMO DATA banner without an explicit opt-in", () => {
    vi.stubEnv("VITE_USE_FACTORY_MOCK", "1");
    render(<FactoryApp />);
    expect(screen.queryByText(/DEMO DATA/i)).toBeNull();
  });

  it("shows a DEMO DATA banner when mock mode is actually active", () => {
    vi.stubEnv("VITE_USE_FACTORY_MOCK", "1");
    render(<FactoryApp useMockApi />);
    expect(screen.getByText(/DEMO DATA/i)).toBeInTheDocument();
  });

  it("shows no banner when the env flag is off (prop alone cannot enable mock)", () => {
    vi.stubEnv("VITE_USE_FACTORY_MOCK", "");
    render(<FactoryApp useMockApi />);
    expect(screen.queryByText(/DEMO DATA/i)).toBeNull();
  });
});
