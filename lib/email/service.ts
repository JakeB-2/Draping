import { Resend } from 'resend'

export type Attachment = {
  filename: string
  content: Buffer | string
  contentType?: string
}

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  bcc?: string | string[]
  attachments?: Attachment[]
}

let resendClient: Resend | null = null

function getResend(): Resend {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  resendClient = new Resend(apiKey)
  return resendClient
}

/**
 * Single send entry point. Wired in Phase 5; only `booking.confirmed` is
 * actually called from booking flows in v1.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const from = process.env.EMAIL_FROM
  if (!from) throw new Error('EMAIL_FROM is not set')

  const result = await getResend().emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })

  if (result.error) throw new Error(result.error.message)
  if (!result.data?.id) throw new Error('Resend returned no id')
  return { id: result.data.id }
}
