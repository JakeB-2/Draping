import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EmailTemplateForm } from '../email-template-form'

export default function NewEmailTemplatePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/email-templates" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to email
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-2">Email · Template</p>
        <h1 className="text-2xl font-light mt-1">New template</h1>
      </div>
      <EmailTemplateForm />
    </div>
  )
}
