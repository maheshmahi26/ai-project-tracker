import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Heading2, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface RichTextEditorProps {
  value: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('size-8', active && 'bg-accent text-accent-foreground')}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor }: { editor: Editor }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b p-1">
      <ToolbarButton
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code className="size-4" />
      </ToolbarButton>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  editable = true,
}: RichTextEditorProps): React.JSX.Element {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap text-sm focus:outline-none',
          editable ? 'min-h-32 px-3 py-2' : '',
        ),
        'aria-label': placeholder ?? 'Rich text editor',
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
  });

  if (!editor) return <div className="h-24 animate-pulse rounded-md bg-muted" />;

  // Read-only: TipTap re-parses the HTML into its schema, so any unsafe markup
  // (scripts/handlers) is dropped — safer than dangerouslySetInnerHTML.
  if (!editable) return <EditorContent editor={editor} />;

  return (
    <div className="rounded-md border">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
