import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-can';
import { DocumentUploader } from '../components/document-uploader';
import { DocumentList } from '../components/document-list';
import { SemanticSearch } from '../components/semantic-search';
import { useDocuments } from '../hooks/use-documents';

export default function DocumentsPage(): React.JSX.Element {
  const canUpload = useCan('document:create');
  const { data, isLoading } = useDocuments();

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="text-sm text-muted-foreground">
          Upload documents to make them searchable and let the assistant answer with citations.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Semantic search</CardTitle>
          </CardHeader>
          <CardContent>
            <SemanticSearch />
          </CardContent>
        </Card>

        {canUpload && (
          <Card>
            <CardHeader>
              <CardTitle>Add a document</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUploader />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <DocumentList documents={data?.items ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
