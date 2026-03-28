// P2-1: Group meta — applies to all pages in this directory.
// Middleware declared here is inherited by all pages unless overridden.
export const meta = {
  middleware: ['group-auth'],
  layout: 'group',
}
