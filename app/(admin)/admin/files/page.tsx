import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { FilesSection, type DocumentRow } from './files-section'

async function FilesContent() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('id, storage_path, file_name, content_type, file_size, title, description, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return <FilesSection documents={(data ?? []) as DocumentRow[]} />
}

function ContentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

export default function FilesPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
        <h1 className="text-2xl font-light mt-1">Files</h1>
      </div>
      <Suspense fallback={<ContentSkeleton />}>
        <FilesContent />
      </Suspense>
    </div>
  )
}
