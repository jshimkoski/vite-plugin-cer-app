component('page-cookie-test', () => {
  const testCookie = useCookie('ks-test-cookie')

  function setCookie() {
    testCookie.set('hello-from-cer-app')
    window.location.reload()
  }

  function removeCookie() {
    testCookie.remove()
    window.location.reload()
  }

  return html`
    <div>
      <h1 data-cy="cookie-test-heading">Cookie Test</h1>
      <p data-cy="cookie-value">Value: ${testCookie.value ?? 'not set'}</p>
      <button data-cy="set-cookie" @click="${setCookie}">Set cookie</button>
      <button data-cy="remove-cookie" @click="${removeCookie}">Remove cookie</button>
    </div>
  `
})
