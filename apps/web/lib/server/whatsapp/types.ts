/**
 * OpenWA Webhook and API types.
 */

export interface OpenWAMessageData {
  id: string
  from: string // e.g. "919876543210@c.us"
  to: string
  chatId: string
  body?: string
  type?: string
  timestamp?: number
  fromMe?: boolean
  isGroup?: boolean
  author?: string
}

export interface OpenWAWebhookPayload {
  event: string
  timestamp: string
  sessionId: string
  idempotencyKey?: string
  deliveryId?: string
  data: OpenWAMessageData
}

export interface OpenWASendTextPayload {
  chatId: string
  text: string
}

export interface OpenWASendTextResponse {
  messageId: string
  timestamp: number
}

export interface OpenWASessionInfo {
  id: string
  name: string
  status: 'created' | 'initializing' | 'qr_ready' | 'authenticating' | 'ready' | 'disconnected'
  phone?: string
  pushName?: string
  connectedAt?: string
}
