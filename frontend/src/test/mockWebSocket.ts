/**
 * Minimal WebSocket double.
 *
 * Lets the tests drive open/message/close from the "server" side so the
 * reconnect logic can be exercised without a real socket or a real network.
 */
export class MockWebSocket {
  static instances: MockWebSocket[] = []

  static reset(): void {
    MockWebSocket.instances = []
  }

  static get last(): MockWebSocket {
    const socket = MockWebSocket.instances.at(-1)
    if (!socket) throw new Error('No MockWebSocket has been constructed')
    return socket
  }

  readonly url: string
  readyState = 0
  closedByClient = false

  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  /** Simulate the server accepting the connection. */
  serverOpen(): void {
    this.readyState = 1
    this.onopen?.()
  }

  /** Simulate a telemetry frame arriving. */
  serverSend(payload: unknown): void {
    this.serverSendRaw(JSON.stringify(payload))
  }

  /** Simulate a raw frame, valid JSON or not. */
  serverSendRaw(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>)
  }

  /** Simulate the connection dropping from the server or network side. */
  serverClose(): void {
    this.readyState = 3
    this.onclose?.()
  }

  /** The client calling close(); the browser does not fire onclose for us here. */
  close(): void {
    this.closedByClient = true
    this.readyState = 3
  }
}
