import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, File as FileIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import {
  FILE_MAX_BYTES,
  isAllowedMimeType,
  type FileDTO,
  type FileScope,
} from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-states/empty-state';
import { useCan } from '@/hooks/use-can';
import { cn } from '@/lib/utils';
import { useDeleteFile, useDownloadFile, useFiles, useUploadFile } from '../hooks/use-files';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({ file, scope }: { file: FileDTO; scope: FileScope }): React.JSX.Element {
  const download = useDownloadFile();
  const del = useDeleteFile(scope);
  const canDelete = useCan('task:update');

  return (
    <li className="flex items-center gap-3 rounded-md border p-2">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={`Download ${file.fileName}`}
        onClick={() => download.mutate(file.id)}
        disabled={download.isPending}
      >
        <Download className="size-4" />
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive hover:text-destructive"
          aria-label={`Delete ${file.fileName}`}
          onClick={() =>
            del.mutate(file.id, { onSuccess: () => toast.success('Attachment removed') })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  );
}

export function AttachmentsSection({ scope }: { scope: FileScope }): React.JSX.Element {
  const { data: files, isLoading, isError } = useFiles(scope);
  const upload = useUploadFile(scope);
  const canUpload = useCan('task:update');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = async (list: FileList | null): Promise<void> => {
    if (!list || list.length === 0) return;
    for (const file of Array.from(list)) {
      if (file.size > FILE_MAX_BYTES) {
        toast.error(`${file.name} is too large (max ${formatBytes(FILE_MAX_BYTES)})`);
        continue;
      }
      if (!isAllowedMimeType(file.type || 'application/octet-stream')) {
        toast.error(`${file.name}: unsupported file type`);
        continue;
      }
      try {
        await upload.mutateAsync(file);
        toast.success(`Uploaded ${file.name}`);
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  };

  return (
    <div className="space-y-3">
      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center transition-colors',
            dragActive ? 'border-primary bg-primary/5' : 'border-input',
          )}
        >
          <Upload className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag &amp; drop files here, or{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => inputRef.current?.click()}
            >
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">Up to {formatBytes(FILE_MAX_BYTES)}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {upload.isPending && <p className="text-xs text-muted-foreground">Uploading…</p>}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <EmptyState title="Couldn't load files" description="Try again in a moment." />
      ) : (files?.length ?? 0) === 0 ? (
        <EmptyState icon={Paperclip} title="No attachments" description="Upload files to this task." />
      ) : (
        <ul className="space-y-2">
          {files?.map((file) => (
            <FileRow key={file.id} file={file} scope={scope} />
          ))}
        </ul>
      )}
    </div>
  );
}
