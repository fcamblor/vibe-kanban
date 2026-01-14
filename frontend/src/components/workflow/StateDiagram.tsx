import { useEffect, useRef } from 'react';
import type { WorkflowStatus, WorkflowTransition } from 'shared/types';

interface StateDiagramProps {
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
}

export function StateDiagram({ statuses, transitions }: StateDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Generate Mermaid diagram code
    const generateMermaidCode = () => {
      let code = 'stateDiagram-v2\n';

      // Add states
      statuses.forEach((status) => {
        code += `    ${status.name}\n`;
      });

      // Add wildcard state (special note for "any status")
      const hasWildcardTransitions = transitions.some(
        (t) => t.from_status === '*'
      );
      if (hasWildcardTransitions) {
        code += `    any_status\n`;
      }

      code += '\n';

      // Add transitions from initial state to initial statuses
      const initialStatuses = statuses.filter((s) => s.is_initial);
      initialStatuses.forEach((status) => {
        code += `    [*] --> ${status.name}\n`;
      });

      code += '\n';

      // Add transitions
      const addedTransitions = new Set<string>();
      transitions.forEach((transition) => {
        // Replace "*" with "any_status" for mermaid display
        const fromState =
          transition.from_status === '*' ? 'any_status' : transition.from_status;
        const key = `${fromState}->${transition.to_status}`;
        if (!addedTransitions.has(key)) {
          code += `    ${fromState} --> ${transition.to_status}\n`;
          addedTransitions.add(key);
        }
      });

      code += '\n';

      // Add transitions from terminal statuses to final state
      const terminalStatuses = statuses.filter((s) => s.is_terminal);
      terminalStatuses.forEach((status) => {
        code += `    ${status.name} --> [*]\n`;
      });

      // Add styling for wildcard state
      if (hasWildcardTransitions) {
        code += '\n    classDef wildcard fill:#f3f4f6,stroke:#9ca3af,stroke-width:2px,color:#6b7280,font-style:italic;\n';
        code += '    class any_status wildcard\n';
      }

      return code;
    };

    const mermaidCode = generateMermaidCode();

    // Load and initialize mermaid
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js';
    script.async = true;

    script.onload = () => {
      // Initialize mermaid with the container
      if (window.mermaid) {
        window.mermaid.contentLoaded();

        // Clear previous content and add diagram
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div class="mermaid">${mermaidCode}</div>`;
          window.mermaid.run?.();
        }
      }
    };

    // Check if mermaid is already loaded
    if (window.mermaid) {
      if (containerRef.current) {
        containerRef.current.innerHTML = `<div class="mermaid">${mermaidCode}</div>`;
      }
      window.mermaid.run?.();
    } else {
      document.head.appendChild(script);
    }

    return () => {
      // Cleanup
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [statuses, transitions]);

  return (
    <div
      ref={containerRef}
      className="border rounded-lg p-4 bg-white overflow-auto max-h-96 workflow-diagram"
    />
  );
}


// Type declaration for window.mermaid
declare global {
  interface Window {
    mermaid?: {
      contentLoaded: () => void;
      run?: () => Promise<void>;
      render?: (id: string, code: string) => Promise<void>;
    };
  }
}
