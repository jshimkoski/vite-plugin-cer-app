// Echo endpoint — used by e2e tests to verify req.body and req.query parsing.
//
//   POST /api/echo        { ...any }  → echoes the JSON body back
//   GET  /api/echo?k=v              → echoes the query string back

export const GET = (req: any, res: any) => {
  res.json({ query: req.query })
}

export const POST = (req: any, res: any) => {
  res.json({ echo: req.body })
}
