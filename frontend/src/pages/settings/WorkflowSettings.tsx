import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Trash2, Edit } from 'lucide-react';
import { useWorkflowSchemes } from '@/hooks/useWorkflowSchemes';
import { SchemeEditorDialog } from '@/components/dialogs/workflow/SchemeEditorDialog';
import type { WorkflowScheme } from 'shared/types';

export function WorkflowSettings() {
  const { schemes, isLoading, error, createScheme, updateScheme, deleteScheme } =
    useWorkflowSchemes();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<WorkflowScheme | undefined>();
  const [deletingSchemeId, setDeletingSchemeId] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const handleCreateNew = () => {
    setEditingScheme(undefined);
    setIsEditorOpen(true);
  };

  const handleEdit = (scheme: WorkflowScheme) => {
    setEditingScheme(scheme);
    setIsEditorOpen(true);
  };

  const handleSaveScheme = async (
    data: Omit<WorkflowScheme, 'id' | 'created_at' | 'updated_at'>
  ) => {
    try {
      setEditorError(null);
      if (editingScheme) {
        await updateScheme(editingScheme.id, data);
      } else {
        await createScheme(data);
      }
    } catch (err) {
      setEditorError(
        err instanceof Error ? err.message : 'Failed to save scheme'
      );
      throw err;
    }
  };

  const handleDeleteScheme = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this scheme?')) {
      return;
    }

    setDeletingSchemeId(id);
    try {
      await deleteScheme(id);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Failed to delete scheme'
      );
    } finally {
      setDeletingSchemeId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load schemes'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workflow Schemes</CardTitle>
              <CardDescription>
                Create and manage workflow schemes for your projects
              </CardDescription>
            </div>
            <Button onClick={handleCreateNew} disabled={isLoading}>
              <Plus className="h-4 w-4 mr-2" />
              New Scheme
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">
                Loading schemes...
              </span>
            </div>
          ) : schemes.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No workflow schemes yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {schemes.map((scheme) => (
                <div
                  key={scheme.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{scheme.name}</h3>
                      {scheme.is_default && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    {scheme.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {scheme.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {scheme.statuses.length} statuses,{' '}
                      {scheme.transitions.length} transitions
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(scheme)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteScheme(scheme.id)}
                      disabled={deletingSchemeId === scheme.id || scheme.is_default}
                      title={
                        scheme.is_default
                          ? 'Cannot delete default scheme'
                          : undefined
                      }
                    >
                      {deletingSchemeId === scheme.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SchemeEditorDialog
        scheme={editingScheme}
        onSave={handleSaveScheme}
        isOpen={isEditorOpen}
        onOpenChange={setIsEditorOpen}
      />

      {editorError && (
        <Alert variant="destructive">
          <AlertDescription>{editorError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
