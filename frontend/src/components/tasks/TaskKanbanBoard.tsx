import { memo, useMemo, useState } from 'react';
import { useAuth } from '@/hooks';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskWithAttemptStatus, WorkflowScheme } from 'shared/types';
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
  selectedTask?: TaskWithAttemptStatus | null;
  getValidTargetStatuses?: (fromStatus: string) => Set<string>;
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
  selectedTask,
  getValidTargetStatuses,
}: TaskKanbanBoardProps) {
  const { userId } = useAuth();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Track drag state
  const handleDragStart = (event: any) => {
    setDraggedTaskId(event.active.id as string);
  };

  const handleDragCancel = () => {
    setDraggedTaskId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedTaskId(null);
    onDragEnd(event);
  };

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
        // Use color directly - can be any CSS expression
        // (rgba, hsl, hex, or var(...) with CSS variable)
        return status.color;
      }
    }
    // Fallback to legacy color lookup
    return statusBoardColors[statusName] || '#000000';
  };

  // Check if a column is a valid drop target
  const isColumnDropTarget = (statusName: string): boolean => {
    // If dragging, use the dragged task's status
    if (draggedTaskId && getValidTargetStatuses) {
      const draggedTask = Object.values(columns)
        .flat()
        .find((item): item is Extract<KanbanColumnItem, { type: 'task' }> => item.type === 'task' && item.task.id === draggedTaskId)?.task;

      if (draggedTask) {
        const currentStatus = draggedTask.workflow_status || draggedTask.status;
        if (currentStatus === statusName) return true; // Current status is always valid
        const validTargets = getValidTargetStatuses(currentStatus);
        return validTargets.has(statusName);
      }
    }

    // Otherwise use selectedTask (click-based selection)
    if (!selectedTask || !getValidTargetStatuses) return true;

    const currentStatus = selectedTask.workflow_status || selectedTask.status;
    if (currentStatus === statusName) return true; // Current status is always valid

    const validTargets = getValidTargetStatuses(currentStatus);
    return validTargets.has(statusName);
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
    return statusLabels[statusName] || statusName;
  };

  // Check if a status is human-in-the-loop (no auto_execute or not configured)
  const isHumanInTheLoop = (statusName: string): boolean => {
    if (!scheme?.statuses) return true;
    const status = scheme.statuses.find((s) => s.name === statusName);
    if (!status?.agent_config) return true; // No agent config = HITL
    return !status.agent_config.auto_execute; // Not auto-execute = HITL
  };

  // Check if a status is initial (can create tasks in this status)
  const isInitialStatus = (statusName: string): boolean => {
    if (!scheme?.statuses) return statusName === 'todo'; // Fallback to todo if no scheme
    const status = scheme.statuses.find((s) => s.name === statusName);
    return status?.is_initial ?? false;
  };

  return (
    <KanbanProvider
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      {columnOrder.map((statusName) => {
        const items = columns[statusName] || [];
        const isValidTarget = isColumnDropTarget(statusName);

        return (
          <KanbanBoard
            key={statusName}
            id={statusName}
            isDragging={draggedTaskId !== null}
            isValidDropTarget={isValidTarget}
          >
            <KanbanHeader
              name={getStatusDisplayName(statusName)}
              color={getStatusColor(statusName)}
              onAddTask={onCreateTask}
              showHitlEmoji={isHumanInTheLoop(statusName)}
              disableAddTask={!isInitialStatus(statusName)}
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
                      status={statusName}
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
                    status={statusName}
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
