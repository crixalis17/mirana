'use client';

import {useEffect, useRef} from 'react';
import {createMiranaTools} from '@/lib/webmcp';

type ModelContext = {
  registerTool: (tool: ReturnType<typeof createMiranaTools>[number], options: {signal: AbortSignal}) => void | Promise<void>;
};
type UiActions = {
  getUiState: () => unknown;
  navigate: (input: {view: 'list' | 'preferences'; purchaseId?: string}) => unknown;
  openItemForm: (input: {purchaseId?: string}) => unknown;
  openAlerts: (input: {purchaseId: string}) => unknown;
  closeDialog: () => unknown;
};

export function useMiranaWebMCP(userId: string | null, onMutation: () => Promise<void>, ui: UiActions) {
  const latest = useRef({onMutation, ui});
  useEffect(() => {latest.current = {onMutation, ui};}, [onMutation, ui]);
  useEffect(() => {
    const model = (document as Document & {modelContext?: ModelContext}).modelContext;
    if (!model?.registerTool) return;
    const lifecycle = new AbortController();
    const request = async (path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) => {
      const response = await fetch(path, {method, credentials: 'same-origin', cache: 'no-store', signal: lifecycle.signal,
        ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
      return data;
    };
    for (const tool of createMiranaTools({request, onMutation: () => latest.current.onMutation(),
      getUiState: () => latest.current.ui.getUiState(), navigate: input => latest.current.ui.navigate(input),
      openItemForm: input => latest.current.ui.openItemForm(input), openAlerts: input => latest.current.ui.openAlerts(input),
      closeDialog: () => latest.current.ui.closeDialog()})) {
      try {
        Promise.resolve(model.registerTool(tool, {signal: lifecycle.signal})).catch(error => {
          if (!lifecycle.signal.aborted) console.warn(`Mirana WebMCP: could not register ${tool.name}.`, error);
        });
      } catch (error) {console.warn(`Mirana WebMCP: could not register ${tool.name}.`, error);}
    }
    return () => lifecycle.abort();
  }, [userId]);
}
