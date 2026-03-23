import {
  getTemplateFieldKind,
  getTemplateFieldLabel,
  type PosterTemplateDefinition,
} from '../templateTypes';

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(file);
  });
}

const FIELD_LABELS: Record<string, string> = {
  eventTitle: 'Title / headline',
  tagline: 'Tagline / subtitle',
  dateTime: 'Date & time',
  venue: 'Venue / location',
  host: 'Host / organizer',
  guestName: 'Guest / speaker',
  themeLine: 'Theme / verse / motto',
  contactInfo: 'Contact / RSVP / website',
};

interface PosterTemplateFieldsEditorProps {
  template: PosterTemplateDefinition | undefined;
  fieldKeys: string[];
  fields: Record<string, string>;
  setFields: Dispatch<SetStateAction<Record<string, string>>>;
  onImageReadError?: (message: string) => void;
}

export function PosterTemplateFieldsEditor({
  template,
  fieldKeys,
  fields,
  setFields,
  onImageReadError,
}: PosterTemplateFieldsEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      {fieldKeys.map((key) => {
        const kind = getTemplateFieldKind(template, key);
        const fieldLabel = FIELD_LABELS[key] ?? getTemplateFieldLabel(template, key);
        const val = fields[key] ?? '';
        const isHttpUrl = /^https?:\/\//i.test(val);

        if (kind === 'image') {
          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-600"
            >
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{fieldLabel}</label>
              <input
                type="file"
                accept="image/*"
                className="text-xs text-zinc-600 file:mr-2 file:rounded file:border file:border-zinc-300 file:bg-white file:px-2 file:py-1 dark:text-zinc-300 dark:file:border-zinc-600 dark:file:bg-zinc-800"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const dataUrl = await readImageFileAsDataUrl(file);
                    setFields((f) => ({ ...f, [key]: dataUrl }));
                  } catch {
                    onImageReadError?.('Could not read image file.');
                  }
                  e.target.value = '';
                }}
              />
              <input
                type="url"
                inputMode="url"
                placeholder="Or paste an image URL (https://…)"
                value={isHttpUrl ? val : ''}
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
              {val && (val.startsWith('data:') || isHttpUrl) ? (
                <img
                  src={val}
                  alt=""
                  className="mt-1 max-h-24 max-w-full rounded border border-zinc-200 object-contain dark:border-zinc-600"
                />
              ) : null}
            </div>
          );
        }

        return (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{fieldLabel}</label>
            <input
              type="text"
              value={val}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </div>
        );
      })}
    </div>
  );
}
