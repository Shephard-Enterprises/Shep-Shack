import { createHandler } from './chat.mjs'

Deno.serve(createHandler({ env: (key: string) => Deno.env.get(key) }))
