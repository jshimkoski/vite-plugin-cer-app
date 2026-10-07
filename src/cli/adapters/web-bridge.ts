/** Shared Web Request/Response bridge emitted into Netlify and Cloudflare entrypoints. */
export const WEB_BRIDGE = String.raw`
async function toNodeRequest(webReq) {
  const url = new URL(webReq.url)
  const body = webReq.body && !['GET', 'HEAD'].includes(webReq.method) ? webReq.body : []
  return Object.assign(Readable.from(body), {
    url: url.pathname + url.search, method: webReq.method,
    headers: { host: url.host, ...Object.fromEntries(webReq.headers.entries()) },
  })
}

function createNodeResponse(method) {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const headers = {}
  let resolve, reject, committed = false, bodyless = false, _ended = false
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader(name, value) {
      if (committed) throw new Error('Headers already sent')
      headers[name.toLowerCase()] = value
      return this
    },
    getHeader(name) { return headers[name.toLowerCase()] },
    getHeaders() { return { ...headers } },
    removeHeader(name) {
      if (committed) throw new Error('Headers already sent')
      delete headers[name.toLowerCase()]
    },
    flushHeaders() {
      if (committed) return
      const responseHeaders = new Headers()
      for (const [name, value] of Object.entries(headers)) {
        for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, String(item))
      }
      bodyless = method === 'HEAD' || [204, 205, 304].includes(res.statusCode)
      try {
        const response = new Response(bodyless ? null : readable, { status: res.statusCode, headers: responseHeaders })
        committed = true
        resolve(response)
      } catch (error) { reject(error); this.destroy(error) }
    },
    writeHead(status, reasonOrHeaders, extraHeaders) {
      this.statusCode = status
      for (const [name, value] of Object.entries(extraHeaders ?? (typeof reasonOrHeaders === 'object' ? reasonOrHeaders : {}))) this.setHeader(name, value)
      this.flushHeaders()
      return this
    },
    write(chunk, encoding, callback) {
      if (_ended) return false
      this.flushHeaders()
      if (bodyless) { (typeof encoding === 'function' ? encoding : callback)?.(); return true }
      const pending = writer.write(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      const ready = writer.desiredSize > 0
      void pending.then(() => {
        (typeof encoding === 'function' ? encoding : callback)?.()
        if (!ready && !_ended) this.emit('drain')
      }).catch((error) => this.destroy(error))
      return ready
    },
    end(chunk, encoding, callback) {
      if (_ended) return this
      if (chunk !== undefined && typeof chunk !== 'function') this.write(chunk, encoding)
      this.flushHeaders()
      _ended = true
      void writer.close().then(() => {
        this.emit('finish')
        ;(typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : callback)?.()
      }).catch((error) => this.destroy(error))
      return this
    },
    destroy(error) {
      if (this.destroyed) return this
      this.destroyed = true
      _ended = true
      if (!committed) reject(error ?? new Error('Response aborted'))
      void writer.abort(error).catch(() => {})
      this.emit('close')
      return this
    },
    destroyed: false,
  })
  Object.defineProperties(res, {
    headersSent: { get: () => committed },
    writableEnded: { get: () => _ended },
  })
  // Reader cancellation must stop the producer even when no write is pending.
  void writer.closed.catch((error) => res.destroy(error))
  return { res, promise }
}

async function handleRequest(webReq, dispatchRequest) {
  const nodeReq = await toNodeRequest(webReq)
  const { res, promise } = createNodeResponse(webReq.method)
  const abort = () => res.destroy(webReq.signal.reason)
  webReq.signal.addEventListener('abort', abort, { once: true })
  const cleanup = () => webReq.signal.removeEventListener('abort', abort)
  res.once('finish', cleanup)
  res.once('close', () => { cleanup(); nodeReq.destroy() })
  if (webReq.signal.aborted) abort()
  else void Promise.resolve().then(() => dispatchRequest(nodeReq, res)).catch((error) => {
    if (res.headersSent) res.destroy(error)
    else if (!res.writableEnded) { res.statusCode = 500; res.end('Internal Server Error') }
  })
  return promise
}
`
