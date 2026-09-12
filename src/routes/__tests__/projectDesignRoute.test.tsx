import 'fake-indexeddb/auto';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../core/store/useProjectStore';
import { useCabinetStore } from '../../core/store/useCabinetStore';

const mountedProjects = vi.hoisted(() => [] as Array<string | undefined>);

// Replace the WebGL view only. Keep the real route and project/cabinet stores,
// including the initialize() call made by App when the designer mounts.
vi.mock('../../App', () => ({
  default: function DesignerProbe() {
    const id = useProjectStore((state) => state.metadata?.id);
    const initialize = useProjectStore((state) => state.initialize);
    useEffect(() => {
      mountedProjects.push(useProjectStore.getState().metadata?.id);
      initialize();
    }, [initialize]);
    return <div data-testid="designer-project">{id}</div>;
  },
}));

import { router } from '../index';

function saveProject(name: string, width: number) {
  useProjectStore.getState().newProject(name);
  useCabinetStore.getState().setDimension('width', width);
  useProjectStore.getState().saveProject();
  return useProjectStore.getState().metadata!.id;
}

describe('project design route identity', () => {
  beforeEach(() => {
    localStorage.clear();
    mountedProjects.length = 0;
    useProjectStore.getState().setAutoSave(false);
    useProjectStore.setState({ metadata: null, savedProjects: [], isDirty: false });
    useCabinetStore.setState({ cabinet: null, cabinets: [], activeCabinetId: null });
  });

  afterEach(() => useProjectStore.getState().setAutoSave(false));

  it('loads the requested saved project before the designer mounts, even when another project was current', async () => {
    const projectA = saveProject('Project A', 800);
    saveProject('Project B', 900);
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: [`/projects/${projectA}/design`],
    });
    render(<RouterProvider router={memoryRouter} />);

    await waitFor(() => expect(screen.getByTestId('designer-project')).toHaveTextContent(projectA));
    expect(mountedProjects).toEqual([projectA]);
    expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(800);
  });

  it('does not mount another project when the requested project is unavailable', async () => {
    const projectB = saveProject('Project B', 900);
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: ['/projects/missing-project/design'],
    });
    render(<RouterProvider router={memoryRouter} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Project unavailable');
    expect(screen.queryByTestId('designer-project')).not.toBeInTheDocument();
    expect(mountedProjects).toEqual([]);
    expect(useProjectStore.getState().metadata?.id).toBe(projectB);
    expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(900);
  });

  it('resolves the next project when navigating between design URLs', async () => {
    const projectA = saveProject('Project A', 800);
    const projectB = saveProject('Project B', 900);
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: [`/projects/${projectA}/design`],
    });
    render(<RouterProvider router={memoryRouter} />);
    await waitFor(() => expect(screen.getByTestId('designer-project')).toHaveTextContent(projectA));

    await act(() => memoryRouter.navigate(`/projects/${projectB}/design`));
    await waitFor(() => expect(screen.getByTestId('designer-project')).toHaveTextContent(projectB));
    expect(mountedProjects).toEqual([projectA, projectB]);
    expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(900);
  });

  it('stops displaying the designer if its selected project changes without a route change', async () => {
    const projectA = saveProject('Project A', 800);
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: [`/projects/${projectA}/design`],
    });
    render(<RouterProvider router={memoryRouter} />);
    await waitFor(() => expect(screen.getByTestId('designer-project')).toHaveTextContent(projectA));

    await act(() => { saveProject('Project B', 900); });
    const projectB = useProjectStore.getState().metadata!.id;
    expect(screen.queryByTestId('designer-project')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Project changed');
    expect(screen.getByRole('link', { name: /Open selected project/ })).toHaveAttribute('href', `/projects/${projectB}/design`);
  });

  it('resolves the current alias to the saved project URL', async () => {
    const projectA = saveProject('Project A', 800);
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: ['/projects/current/design'],
    });
    render(<RouterProvider router={memoryRouter} />);

    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe(`/projects/${projectA}/design`));
    expect(screen.getByTestId('designer-project')).toHaveTextContent(projectA);
  });
});
