import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUploadDocument } from '../hooks/use-documents';

const ACCEPT = '.pdf,.docx,.md,.markdown,.txt';

/** Drag-and-drop (or click) uploader that presigns, uploads, and enqueues indexing. */
export function DocumentUploader(): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useUploadDocument();

  const handleFiles = (files: FileList | null): void => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      upload.mutate(
        { file },
        {
          onSuccess: (doc) => toast.success(`Uploaded "${doc.title}" — indexing…`),
          onError: (err) => toast.error(err instanceof Error ? err.message : 'Upload failed'),
        },
      );
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
      )}
    >
      <UploadCloud className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">
        {upload.isPending ? 'Uploading…' : 'Drop a document or click to upload'}
      </p>
      <p className="text-xs text-muted-foreground">PDF, DOCX, Markdown, or TXT</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
