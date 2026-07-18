import { useState } from 'react';
import { Search } from 'lucide-react';
import type { KnowledgeSearchResult } from '@ai-projectos/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSemanticSearch } from '../hooks/use-documents';

/** Semantic search box + grounded results with citations (documentTitle + chunkIndex). */
export function SemanticSearch(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KnowledgeSearchResult | null>(null);
  const search = useSemanticSearch();

  const run = (): void => {
    const q = query.trim();
    if (q.length < 2) return;
    search.mutate({ query: q }, { onSuccess: setResult });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
          }}
          placeholder="Search your documents (e.g. “auth requirements”)…"
        />
        <Button onClick={run} disabled={search.isPending || query.trim().length < 2}>
          <Search className="size-4" />
          Search
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          {result.chunks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching passages found.</p>
          ) : (
            result.chunks.map((chunk, i) => (
              <div key={`${chunk.documentId}-${chunk.chunkIndex}-${i}`} className="rounded-md border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline">{chunk.documentTitle}</Badge>
                  <span className="text-xs text-muted-foreground">
                    #{chunk.chunkIndex} · score {chunk.score.toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{chunk.snippet}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
