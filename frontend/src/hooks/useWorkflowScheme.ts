import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProject } from '@/contexts/ProjectContext';
import { workflowSchemesApi } from '@/lib/api';
import type { WorkflowScheme, WorkflowStatus, WorkflowTransition } from 'shared/types';

export interface UseWorkflowSchemeResult {
  scheme: WorkflowScheme | undefined;
  isLoading: boolean;
  error: Error | null;

  // Helper functions
  getStatus: (statusName: string) => WorkflowStatus | undefined;
  getTransitionsFrom: (statusName: string) => WorkflowTransition[];
  isValidTransition: (from: string, to: string) => boolean;
}

/**
 * Hook to fetch and manage workflow scheme for current project.
 * Handles fallback to default scheme if project doesn't have one assigned.
 */
export function useWorkflowScheme(): UseWorkflowSchemeResult {
  const { project } = useProject();
  const schemeId = project?.workflow_scheme_id;

  const { data: scheme, isLoading, error } = useQuery({
    queryKey: ['workflow-scheme', schemeId],
    queryFn: async () => {
      if (!schemeId) {
        // Fallback to default scheme if project doesn't have one assigned
        return workflowSchemesApi.getDefault();
      }
      return workflowSchemesApi.getById(schemeId);
    },
    enabled: !!project, // Only fetch when project is loaded
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (schemes rarely change)
    retry: 1, // Retry once on failure
  });

  // Helper: Get status by name
  const getStatus = useCallback(
    (statusName: string) => {
      return scheme?.statuses.find((s) => s.name === statusName);
    },
    [scheme]
  );

  // Helper: Get all transitions FROM a specific status
  const getTransitionsFrom = useCallback(
    (statusName: string) => {
      if (!scheme) return [];
      return scheme.transitions.filter((t) => t.from_status === statusName);
    },
    [scheme]
  );

  // Helper: Check if transition is valid
  const isValidTransition = useCallback(
    (from: string, to: string) => {
      if (!scheme) return false;
      return scheme.transitions.some(
        (t) => t.from_status === from && t.to_status === to
      );
    },
    [scheme]
  );

  return {
    scheme,
    isLoading,
    error: error as Error | null,
    getStatus,
    getTransitionsFrom,
    isValidTransition,
  };
}
