'use server'

// Stub — change requests are not used in this app.
export async function reviewChangeRequest(
  _requestId: string,
  _status: string,
  _rejectionNote?: string
): Promise<string | undefined> {
  return 'Not implemented'
}
