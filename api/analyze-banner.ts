import {
  buildGroqBannerQualityRequestBody,
  buildGroqBannerQualitySceneSummaryBody,
  isBannerSceneSummaryPayload,
  parseBannerQualityFromAssistantText,
} from '../src/lib/bannerQualityGroqShared'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let bodyJson: unknown
  try {
    bodyJson = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!bodyJson || typeof bodyJson !== 'object') {
    return new Response(JSON.stringify({ error: 'Body must be a JSON object' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const svgDataUrl = (bodyJson as { svgDataUrl?: unknown }).svgDataUrl
  const sceneSummary = (bodyJson as { sceneSummary?: unknown }).sceneSummary

  let groqBody: string
  try {
    if (typeof svgDataUrl === 'string') {
      groqBody = JSON.stringify(buildGroqBannerQualityRequestBody(svgDataUrl))
    } else if (isBannerSceneSummaryPayload(sceneSummary)) {
      groqBody = JSON.stringify(buildGroqBannerQualitySceneSummaryBody(sceneSummary))
    } else {
      return new Response(JSON.stringify({ error: 'Provide svgDataUrl or a valid sceneSummary object' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let response: Response
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: groqBody,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: `Upstream request failed: ${message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Groq response was not JSON' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!response.ok) {
    return new Response(JSON.stringify(payload), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const text = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    return new Response(JSON.stringify({ error: 'Groq response did not include message content.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = parseBannerQualityFromAssistantText(text)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message, raw: text }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
