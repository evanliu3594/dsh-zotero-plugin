// Simulates the OFFICIAL runtime's module resolution: plain Node ESM, no tsx,
// no tsconfig paths — exactly the walk a plugin import makes under the desktop app.
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

const config = Schema.object({ host: Schema.string().default('127.0.0.1') })
console.log('config default:', JSON.stringify(config({})))
const tool = defineTool({
  name: 'probe',
  description: 'probe',
  parameters: { x: { type: 'string', required: true } },
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
  async execute(args) { return args.x },
})
console.log('defineTool OK:', tool.name, typeof tool.execute)
console.log('PASS: both runtime deps resolve and work under plain node resolution')
