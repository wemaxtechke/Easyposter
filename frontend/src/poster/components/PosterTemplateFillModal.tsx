import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePosterStore } from '../store/posterStore';
import { getTemplateFieldKeys, type PosterTemplateDefinition } from '../templateTypes';
import { instantiateTemplate } from '../templateMerge';
import { PosterTemplateFieldsEditor } from './PosterTemplateFieldsEditor';

interface PosterTemplateFillModalProps {
  open: boolean;
  template: PosterTemplateDefinition | null;
  onClose: () => void;
}

export function PosterTemplateFillModal({ open, template, onClose }: PosterTemplateFillModalProps) {
  const navigate = useNavigate();
  const loadProject = usePosterStore((s) => s.loadProject);

  const keys = useMemo(() => (template ? getTemplateFieldKeys(template) : []), [template]);
  const keysSig = keys.join(',');

  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !template) return;
    setFields(Object.fromEntries(keys.map((k) => [k, ''])));
    setFormError(null);
  }, [open, template, keysSig]);

  const handleGenerate = () => {
    if (!template) return;
    const data: Record<string, string> = {};
    for (const k of keys) {
      data[k] = fields[k] ?? '';
    }
    const { project, fieldBindings } = instantiateTemplate(template, data);
    loadProject(project, { fieldBindings });
    onClose();
    navigate('/poster');
  };

  if (!open || !template) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-labelledby="fill-template-title"
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 id="fill-template-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {template.name}
          </h2>
          {template.description && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{template.description}</p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
            Fill in the fields below, then open the poster in the editor.
          </p>
          {keys.length === 0 ? (
            <p className="text-sm text-zinc-500">This template has no defined fields — it will open as-is.</p>
          ) : (
            <PosterTemplateFieldsEditor
              template={template}
              fieldKeys={keys}
              fields={fields}
              setFields={setFields}
              onImageReadError={setFormError}
            />
          )}
          {formError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formError}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Generate poster
          </button>
        </div>
      </div>
    </div>
  );
}
