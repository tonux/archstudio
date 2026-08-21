/** Feature flags for progressive admin-content migration (ISA M0→M6). */
export function contentFromAdmin(): boolean {
  return process.env.CONTENT_FROM_ADMIN === '1';
}
