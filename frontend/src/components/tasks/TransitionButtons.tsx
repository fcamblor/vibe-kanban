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
import { ChevronDown, Loader2, X } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface TransitionButtonsProps {
  task: TaskWithAttemptStatus;
  onTransitionComplete?: () => void;
}

interface PendingFeedback {
  toStatus: string;
  prompt: string;
}

/**
 * Component that renders workflow transition buttons for a task.
 * Shows individual buttons for ≤4 transitions, dropdown for >4 transitions.
 * Handles transitions that require feedback via a proper dialog component.
 */
export function TransitionButtons({
  task,
  onTransitionComplete,
}: TransitionButtonsProps) {
  const { scheme, getTransitionsFrom } = useWorkflowScheme();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(
    null
  );
  const [feedbackText, setFeedbackText] = useState('');

  const currentStatus = useMemo(
    () => task.workflow_status || task.status,
    [task.workflow_status, task.status]
  );

  const transitions = useMemo(
    () => getTransitionsFrom(currentStatus),
    [currentStatus, getTransitionsFrom]
  );

  const handleTransition = useCallback(
    async (toStatus: string) => {
      setIsTransitioning(true);
      try {
        await tasksApi.update(task.id, {
          title: task.title,
          description: task.description,
          status: toStatus,
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

  const handleTransitionClick = useCallback(
    (
      toStatus: string,
      requiresFeedback: boolean,
      feedbackPrompt: string | null
    ) => {
      if (requiresFeedback && feedbackPrompt) {
        // Show feedback dialog instead of window.prompt
        setPendingFeedback({ toStatus, prompt: feedbackPrompt });
        setFeedbackText('');
      } else {
        // No feedback needed, transition directly
        handleTransition(toStatus);
      }
    },
    [handleTransition]
  );

  const handleFeedbackSubmit = useCallback(async () => {
    if (!pendingFeedback) return;

    // Collect feedback (for now just showing it's collected)
    console.log(
      `Feedback for ${pendingFeedback.toStatus}:`,
      feedbackText
    );

    // Transition to the new status
    await handleTransition(pendingFeedback.toStatus);

    // Clear pending feedback
    setPendingFeedback(null);
    setFeedbackText('');
  }, [pendingFeedback, feedbackText, handleTransition]);

  const handleFeedbackCancel = useCallback(() => {
    setPendingFeedback(null);
    setFeedbackText('');
  }, []);

  // No scheme or no transitions available
  if (!scheme || transitions.length === 0) {
    return null;
  }

  // Case 1: 1-4 transitions → Show separate buttons
  if (transitions.length <= 4) {
    return (
      <>
        <div className="flex gap-2 flex-wrap">
          {transitions.map((transition) => {
            const variant = transition.button_variant || 'default';
            return (
              <Button
                key={transition.to_status}
                variant={variant as any}
                onClick={() =>
                  handleTransitionClick(
                    transition.to_status,
                    transition.requires_feedback,
                    transition.feedback_prompt
                  )
                }
                disabled={isTransitioning || !!pendingFeedback}
                size="sm"
              >
                {isTransitioning && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {transition.button_label}
              </Button>
            );
          })}
        </div>

        {/* Feedback Dialog */}
        <Dialog open={!!pendingFeedback} onOpenChange={handleFeedbackCancel}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg p-6">
              {/* Close button */}
              <button
                onClick={handleFeedbackCancel}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Title */}
              <h2 className="text-lg font-semibold mb-2">
                Additional Information Required
              </h2>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-4">
                {pendingFeedback?.prompt}
              </p>

              {/* Textarea */}
              <Textarea
                placeholder="Enter your feedback here..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="min-h-24 mb-4"
              />

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFeedbackCancel}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackText.trim() || isTransitioning}
                >
                  {isTransitioning && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Submit & Transition
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      </>
    );
  }

  // Case 2: >4 transitions → Show dropdown
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default" disabled={isTransitioning || !!pendingFeedback} size="sm">
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
                handleTransitionClick(
                  transition.to_status,
                  transition.requires_feedback,
                  transition.feedback_prompt
                )
              }
              disabled={isTransitioning || !!pendingFeedback}
            >
              {transition.button_label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Feedback Dialog */}
      <Dialog open={!!pendingFeedback} onOpenChange={handleFeedbackCancel}>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg p-6">
            {/* Close button */}
            <button
              onClick={handleFeedbackCancel}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Title */}
            <h2 className="text-lg font-semibold mb-2">
              Additional Information Required
            </h2>

            {/* Description */}
            <p className="text-sm text-gray-600 mb-4">
              {pendingFeedback?.prompt}
            </p>

            {/* Textarea */}
            <Textarea
              placeholder="Enter your feedback here..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="min-h-24 mb-4"
            />

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFeedbackCancel}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim() || isTransitioning}
              >
                {isTransitioning && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit & Transition
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
