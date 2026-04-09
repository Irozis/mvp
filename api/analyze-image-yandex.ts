export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const apiKey = process.env.YANDEX_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'YANDEX_API_KEY not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await request.text()

  let response: Response
  try {
    response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: `Upstream request failed: ${message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await response.text()
  return new Response(data, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
