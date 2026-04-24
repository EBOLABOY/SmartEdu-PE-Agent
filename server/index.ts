import dotenv from 'dotenv'
import express from 'express'
import { getProviderConfig, requestPatchFromProvider } from './provider.js'
import { assertPatchRequestBody, parsePatchResponse } from './schema.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT ?? '8787')

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  const config = getProviderConfig()
  response.json({
    ok: true,
    configured: Boolean(config),
    model: config?.model ?? null,
    baseUrl: config?.baseUrl ?? null,
  })
})

app.post('/api/patch', async (request, response) => {
  try {
    assertPatchRequestBody(request.body)

    const providerResult = await requestPatchFromProvider(request.body.prompt, request.body.projectState)
    const patch = parsePatchResponse(providerResult.content)

    response.json({
      ...patch,
      providerMeta: {
        model: providerResult.model,
        backend: 'openai-compatible',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error'
    const status = message.includes('尚未配置') ? 503 : 502
    response.status(status).json({
      error: message,
    })
  }
})

app.listen(port, () => {
  console.log(`dongping-server listening on http://127.0.0.1:${port}`)
})
