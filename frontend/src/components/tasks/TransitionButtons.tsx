import { useCallback, useMemo, useState } from 'react';
import { useWorkflowScheme } from '@/hooks/useWorkflowScheme';
import { tasksApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

interface TransitionButtonsProps {
  task: TaskWithAttemptStatus;
  onTransitionComplete?: () => void;
}

/**
 * Component that renders workflow transition buttons for a task.
 * Shows individual buttons for ≤4 transitions, dropdown for >4 transitions.
 * Handles transitions that require feedback via window.prompt (temporary solution).
 */
export function TransitionButtons({
  task,
  onTransitionComplete,
}: TransitionButtonsProps) {
  const { scheme, getTransitionsFrom } = useWorkflowScheme();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const currentStatus = useMemo(
    () => task.workflow_status || task.status,
    [task.workflow_status, task.status]
  );

  const transitions = useMemo(
    () => getTransitionsFrom(currentStatus),
    [currentStatus, getTransitionsFrom]
  );

  const handleTransition = useCallback(
    async (
      toStatus: string,
      requiresFeedback: boolean,
      feedbackPrompt: string | null
    ) => {
      if (requiresFeedback && feedbackPrompt) {
        // TODO: Replace with proper feedback dialog component
        const feedback = window.prompt(feedbackPrompt);
        if (!feedback) return; // User cancelled
        // Note: Feedback is collected but not yet sent to backend
        // This will be implemented in a future phase
      }

      setIsTransitioning(true);
      try {
        await tasksApi.update(task.id, {
          title: task.title,
          description: task.description,
          status: toStatus as TaskStatus,
          parent_workspace_id: task.parent_workspace_id,
          image_ids: null,
        });
        onTransitionComplete?.();
      } catch (err) {
        console.error('Failed to transition task:', err);
        // TODO: Show error toast notification
      } finally {
        setIsTransitioning(false);
      }
    },
    [task, onTransitionComplete]
  );

  // No scheme or no transitions available
  if (!scheme || transitions.length === 0) {
    return null;
  }

  // Case 1: 1-4 transitions → Show separate buttons
  if (transitions.length <= 4) {
    return (
      <div className="flex gap-2 flex-wrap">
        {transitions.map((transition) => {
          const variant = transition.button_variant || 'default';
          return (
            <Button
              key={transition.to_status}
              variant={variant as any}
              onClick={() =>
                handleTransition(
                  transition.to_status,
                  transition.requires_feedback,
                  transition.feedback_prompt
                )
              }
              disabled={isTransitioning}
              size="sm"
            >
              {isTransitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {transition.button_label}
            </Button>
          );
        })}
      </div>
    );
  }

  // Case 2: >4 transitions → Show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" disabled={isTransitioning} size="sm">
          {isTransitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Change Status
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {transitions.map((transition) => (
          <DropdownMenuItem
            key={transition.to_status}
            onClick={() =>
              handleTransition(
                transition.to_status,
                transition.requires_feedback,
                transition.feedback_prompt
              )
            }
            disabled={isTransitioning}
          >
            {transition.button_label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
