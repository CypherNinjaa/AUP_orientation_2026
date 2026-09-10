import 'server-only'

import { env } from '../env'
import { toChatId } from './auth'
import type { OpenWASendTextResponse, OpenWASessionInfo } from './types'

export class OpenWAClient {
  private baseUrl?: string
  private apiKey?: string
  private sessionId?: string

  constructor(options?: { baseUrl?: string; apiKey?: string; sessionId?: string }) {
    this.baseUrl = options?.baseUrl ?? env.OPENWA_BASE_URL
    this.apiKey = options?.apiKey ?? env.OPENWA_API_KEY
    this.sessionId = options?.sessionId ?? env.OPENWA_SESSION_ID
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey && this.sessionId)
  }

  /**
   * Sends a plain or markdown formatted text message to a WhatsApp chat.
   */
  async sendTextMessage(
    phoneNumberOrChatId: string,
    text: string,
  ): Promise<OpenWASendTextResponse | null> {
    if (!this.isConfigured) {
      console.warn('[whatsapp:client] OpenWA credentials not fully configured, message not sent')
      return null
    }

    const chatId = toChatId(phoneNumberOrChatId)
    const url = `${this.baseUrl}/api/sessions/${this.sessionId}/messages/send-text`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey!,
        },
        body: JSON.stringify({
          chatId,
          text,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.error(
          `[whatsapp:client] Failed to send message to ${chatId}: ${String(response.status)} - ${errorText}`,
        )
        return null
      }

      const data = (await response.json()) as OpenWASendTextResponse
      return data
    } catch (error) {
      console.error(`[whatsapp:client] Network error sending message to ${chatId}:`, error)
      return null
    }
  }

  /**
   * Sends a broadcast message to multiple phone numbers.
   */
  async broadcastTextMessage(
    phoneNumbers: string[],
    text: string,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0
    let failed = 0

    for (const phone of phoneNumbers) {
      const res = await this.sendTextMessage(phone, text)
      if (res) {
        sent++
      } else {
        failed++
      }
      // Brief delay to be polite to the WhatsApp engine
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return { sent, failed }
  }

  /**
   * Fetches the current session status.
   */
  async getSessionStatus(): Promise<OpenWASessionInfo | null> {
    if (!this.isConfigured) return null

    const url = `${this.baseUrl}/api/sessions/${this.sessionId}`
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey!,
        },
      })

      if (!response.ok) return null
      return (await response.json()) as OpenWASessionInfo
    } catch (error) {
      console.error('[whatsapp:client] Error fetching session info:', error)
      return null
    }
  }
}

export const whatsappClient = new OpenWAClient()
