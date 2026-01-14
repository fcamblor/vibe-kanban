import { useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowSchemesApi } from '@/lib/api';
import type { WorkflowScheme } from 'shared/types';

export function useWorkflowSchemes() {
  const queryClient = useQueryClient();

  const {
    data: schemes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflow-schemes'],
    queryFn: () => workflowSchemesApi.getAll(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const createScheme = async (
    data: Omit<WorkflowScheme, 'id' | 'created_at' | 'updated_at'>
  ) => {
    const newScheme = await workflowSchemesApi.create(data);
    await queryClient.invalidateQueries({
      queryKey: ['workflow-schemes'],
    });
    return newScheme;
  };

  const updateScheme = async (
    id: string,
    data: Partial<Omit<WorkflowScheme, 'id' | 'created_at' | 'updated_at'>>
  ) => {
    const updated = await workflowSchemesApi.update(id, data);
    await queryClient.invalidateQueries({
      queryKey: ['workflow-schemes'],
    });
    return updated;
  };

  const deleteScheme = async (id: string) => {
    await workflowSchemesApi.delete(id);
    await queryClient.invalidateQueries({
      queryKey: ['workflow-schemes'],
    });
  };

  return {
    schemes,
    isLoading,
    error,
    createScheme,
    updateScheme,
    deleteScheme,
  };
}
