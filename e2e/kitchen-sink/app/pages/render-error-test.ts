/**
 * Kitchen-sink page for P0-1: SSR render error handling.
 *
 * This page's component throws during render to simulate an unexpected error
 * in the rendering pipeline. In SSR mode the server must respond with a 500
 * page rather than crashing or hanging indefinitely.
 */
component('page-render-error-test', () => {
  throw new Error('Intentional render error for P0-1 testing')
  // unreachable
  return html`<div></div>`
})
