import { memo, useMemo } from 'react';
import { useAuth } from '@/hooks';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskWithAttemptStatus, WorkflowScheme } from 'shared/types';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { SharedTaskCard } from './SharedTaskCard';

export type KanbanColumnItem =
  | {
      type: 'task';
      task: TaskWithAttemptStatus;
      sharedTask?: SharedTaskRecord;
    }
  | {
      type: 'shared';
      task: SharedTaskRecord;
    };

export type KanbanColumns = Record<string, KanbanColumnItem[]>;

interface TaskKanbanBoardProps {
  columns: KanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onViewSharedTask?: (task: SharedTaskRecord) => void;
  selectedTaskId?: string;
  selectedSharedTaskId?: string | null;
  onCreateTask?: () => void;
  projectId: string;
  scheme?: WorkflowScheme;
}

function TaskKanbanBoard({
  columns,
  onDragEnd,
  onViewTaskDetails,
  onViewSharedTask,
  selectedTaskId,
  selectedSharedTaskId,
  onCreateTask,
  projectId,
  scheme,
}: TaskKanbanBoardProps) {
  const { userId } = useAuth();

  // Determine column order: use scheme statuses if available, else legacy order
  const columnOrder = useMemo(() => {
    if (scheme?.statuses) {
      return scheme.statuses
        .sort((a, b) => a.position - b.position)
        .map((s) => s.name);
    }
    // Fallback to legacy order if no scheme
    return ['todo', 'inprogress', 'inreview', 'done', 'cancelled'];
  }, [scheme?.statuses]);

  // Get color for a status name
  const getStatusColor = (statusName: string): string => {
    if (scheme?.statuses) {
      const status = scheme.statuses.find((s) => s.name === statusName);
      if (status && status.color) {
        // Color is CSS variable name like "--info"
        return `var(${status.color})`;
      }
    }
    // Fallback to legacy color lookup
    return statusBoardColors[statusName as TaskStatus] || '#000000';
  };

  // Get display name for a status
  const getStatusDisplayName = (statusName: string): string => {
    if (scheme?.statuses) {
      const status = scheme.statuses.find((s) => s.name === statusName);
      if (status) {
        return status.display_name;
      }
    }
    // Fallback to legacy label lookup
    return statusLabels[statusName as TaskStatus] || statusName;
  };

  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {columnOrder.map((statusName) => {
        const items = columns[statusName] || [];

        return (
          <KanbanBoard key={statusName} id={statusName}>
            <KanbanHeader
              name={getStatusDisplayName(statusName)}
              color={getStatusColor(statusName)}
              onAddTask={onCreateTask}
            />
            <KanbanCards>
              {items.map((item, index) => {
                const isOwnTask =
                  item.type === 'task' &&
                  (!item.sharedTask?.assignee_user_id ||
                    !userId ||
                    item.sharedTask?.assignee_user_id === userId);

                if (isOwnTask) {
                  return (
                    <TaskCard
                      key={item.task.id}
                      task={item.task}
                      index={index}
                      status={statusName as TaskStatus}
                      onViewDetails={onViewTaskDetails}
                      isOpen={selectedTaskId === item.task.id}
                      projectId={projectId}
                      sharedTask={item.sharedTask}
                    />
                  );
                }

                const sharedTask =
                  item.type === 'shared' ? item.task : item.sharedTask!;

                return (
                  <SharedTaskCard
                    key={`shared-${item.task.id}`}
                    task={sharedTask}
                    index={index}
                    status={statusName as TaskStatus}
                    isSelected={selectedSharedTaskId === item.task.id}
                    onViewDetails={onViewSharedTask}
                  />
                );
              })}
            </KanbanCards>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
}

export default memo(TaskKanbanBoard);
