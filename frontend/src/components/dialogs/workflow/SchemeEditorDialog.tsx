import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import type { WorkflowScheme } from 'shared/types';
import { StateDiagram } from '@/components/workflow/StateDiagram';

interface SchemeEditorDialogProps {
  scheme?: WorkflowScheme;
  onSave: (scheme: Omit<WorkflowScheme, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SchemeEditorDialog({
  scheme,
  onSave,
  isOpen,
  onOpenChange,
}: SchemeEditorDialogProps) {
  const [name, setName] = useState(scheme?.name || '');
  const [description, setDescription] = useState(scheme?.description || '');
  const [statusesJson, setStatusesJson] = useState(
    JSON.stringify(scheme?.statuses || [], null, 2)
  );
  const [transitionsJson, setTransitionsJson] = useState(
    JSON.stringify(scheme?.transitions || [], null, 2)
  );
  const [isDefault, setIsDefault] = useState(scheme?.is_default || false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Update form fields when scheme changes (e.g., when editing a different scheme)
  useEffect(() => {
    if (isOpen) {
      setName(scheme?.name || '');
      setDescription(scheme?.description || '');
      setStatusesJson(JSON.stringify(scheme?.statuses || [], null, 2));
      setTransitionsJson(JSON.stringify(scheme?.transitions || [], null, 2));
      setIsDefault(scheme?.is_default || false);
      setError(null);
    }
  }, [scheme, isOpen]);

  // Compute diagram data for preview
  const diagramData = useMemo(() => {
    try {
      const statuses = JSON.parse(statusesJson);
      const transitions = JSON.parse(transitionsJson);

      if (Array.isArray(statuses) && Array.isArray(transitions)) {
        return { statuses, transitions };
      }
    } catch {
      // Ignore parsing errors - will be caught by validateJson
    }

    return { statuses: [], transitions: [] };
  }, [statusesJson, transitionsJson]);

  const validateJson = useCallback((): {
    statuses: Array<any>;
    transitions: Array<any>;
  } | null => {
    try {
      let statuses = JSON.parse(statusesJson);
      let transitions = JSON.parse(transitionsJson);

      if (!Array.isArray(statuses)) {
        setError('Statuses must be an array');
        return null;
      }

      if (!Array.isArray(transitions)) {
        setError('Transitions must be an array');
        return null;
      }

      // Validate and normalize statuses
      for (let i = 0; i < statuses.length; i++) {
        const status = statuses[i];
        if (!status.name || typeof status.name !== 'string') {
          setError('Each status must have a "name" field (string)');
          return null;
        }
        if (!status.display_name || typeof status.display_name !== 'string') {
          setError('Each status must have a "display_name" field (string)');
          return null;
        }
        if (!status.color || typeof status.color !== 'string') {
          setError('Each status must have a "color" field (string, e.g., "hsl(0, 0%, 50%)")');
          return null;
        }
        if (typeof status.position !== 'number') {
          setError('Each status must have a "position" field (number)');
          return null;
        }

        // Add default values for optional fields
        statuses[i] = {
          ...status,
          is_initial: status.is_initial ?? false,
          is_terminal: status.is_terminal ?? false,
          agent_config: status.agent_config ?? null,
          automated_actions: status.automated_actions ?? [],
        };
      }

      // Validate and normalize transitions
      for (let i = 0; i < transitions.length; i++) {
        const transition = transitions[i];
        if (!transition.from_status || typeof transition.from_status !== 'string') {
          setError('Each transition must have a "from_status" field (string)');
          return null;
        }
        if (!transition.to_status || typeof transition.to_status !== 'string') {
          setError('Each transition must have a "to_status" field (string)');
          return null;
        }

        // Add default values for optional fields
        transitions[i] = {
          ...transition,
          button_label: transition.button_label ?? null,
          button_variant: transition.button_variant ?? null,
          requires_feedback: transition.requires_feedback ?? false,
          feedback_prompt: transition.feedback_prompt ?? null,
          pre_actions: transition.pre_actions ?? [],
          post_actions: transition.post_actions ?? [],
        };
      }

      setError(null);
      return { statuses, transitions };
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? `Invalid JSON: ${err.message}`
          : 'Failed to parse JSON'
      );
      return null;
    }
  }, [statusesJson, transitionsJson]);

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Scheme name is required');
      return;
    }

    const schema = validateJson();
    if (!schema) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        statuses: schema.statuses,
        transitions: schema.transitions,
        is_default: isDefault,
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save scheme'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    // Only allow closing when explicitly requested (via Cancel/Save buttons)
    // ESC and backdrop clicks are ignored
    if (open) {
      onOpenChange(true);
    }
    // When open is false (ESC or backdrop), do nothing
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange} className="!w-[80vw] !max-w-none">
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {scheme ? 'Edit Workflow Scheme' : 'Create Workflow Scheme'}
          </DialogTitle>
          <DialogDescription>
            Define statuses and valid transitions for tasks in this project
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="scheme-name">Scheme Name</Label>
            <Input
              id="scheme-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Standard Workflow"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheme-description">Description (optional)</Label>
            <Textarea
              id="scheme-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this workflow scheme..."
              rows={2}
            />
          </div>

          {diagramData.statuses.length > 0 && (
            <div className="space-y-2">
              <Label>State Diagram Preview</Label>
              <StateDiagram
                statuses={diagramData.statuses}
                transitions={diagramData.transitions}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="statuses-json">Statuses (JSON)</Label>
            <p className="text-sm text-muted-foreground">
              Array of statuses with name, display_name, color, and position.
            </p>
            <Textarea
              id="statuses-json"
              value={statusesJson}
              onChange={(e) => setStatusesJson(e.target.value)}
              placeholder={JSON.stringify(
                [
                  {
                    name: 'todo',
                    display_name: 'To Do',
                    color: '--blue-500',
                    position: 0,
                  },
                  {
                    name: 'inprogress',
                    display_name: 'In Progress',
                    color: '--yellow-500',
                    position: 1,
                  },
                ],
                null,
                2
              )}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transitions-json">Transitions (JSON)</Label>
            <p className="text-sm text-muted-foreground">
              Array of transitions with from_status and to_status. Use &quot;*&quot;
              as from_status for transitions from any status.
            </p>
            <Textarea
              id="transitions-json"
              value={transitionsJson}
              onChange={(e) => setTransitionsJson(e.target.value)}
              placeholder={JSON.stringify(
                [
                  {
                    from_status: 'todo',
                    to_status: 'inprogress',
                    button_label: 'Start',
                  },
                  {
                    from_status: 'inprogress',
                    to_status: 'done',
                    button_label: 'Complete',
                  },
                  {
                    from_status: '*',
                    to_status: 'cancelled',
                    button_label: 'Cancel',
                  },
                ],
                null,
                2
              )}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-default"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <Label htmlFor="is-default" className="cursor-pointer">
              Set as default scheme for new projects
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              // Directly close without triggering handleDialogOpenChange
              onOpenChange(false);
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {scheme ? 'Update Scheme' : 'Create Scheme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Singleton dialog helper
let resolvePromise: ((value: Omit<WorkflowScheme, 'id' | 'created_at' | 'updated_at'> | null) => void) | null = null;

export const SchemeEditorDialog_: {
  show: (
    options: SchemeEditorDialogProps['onSave'],
    scheme?: WorkflowScheme
  ) => Promise<Omit<WorkflowScheme, 'id' | 'created_at' | 'updated_at'> | null>;
  hide: () => void;
} = {
  show: (_onSave, _scheme) => {
    return new Promise((resolve) => {
      resolvePromise = resolve;
      // This would be used with a global dialog system
    });
  },
  hide: () => {
    if (resolvePromise) {
      resolvePromise(null);
      resolvePromise = null;
    }
  },
};
