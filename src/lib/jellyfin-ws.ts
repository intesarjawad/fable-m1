// src/lib/jellyfin-ws.ts

type MessageHandler = (data: any) => void;

export class JellyfinWebSocket {
  private socket: WebSocket | null = null;
  private subscribers = new Map<string, Set<MessageHandler>>();
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private serverUrl = "";
  private token = "";
  private deviceId = "";
  private intentionalClose = false;

  connect(serverUrl: string, token: string, deviceId: string) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.deviceId = deviceId;
    this.intentionalClose = false;
    this.reconnectDelay = 1000;
    this.openConnection();
  }

  private openConnection() {
    this.cleanup();

    const wsProtocol = this.serverUrl.startsWith("https") ? "wss" : "ws";
    const baseUrl = this.serverUrl.replace(/^https?:\/\//, "");
    const url = `${wsProtocol}://${baseUrl}/socket?api_key=${this.token}&deviceId=${this.deviceId}`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log("[JellyfinWS] Connected to", url.replace(/api_key=[^&]+/, "api_key=***"));
      this.reconnectDelay = 1000;
      this.startKeepAlive();
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const messageType = message.MessageType;
        if (messageType === "SyncPlayCommand" || messageType === "SyncPlayGroupUpdate") {
          console.log("[JellyfinWS] SyncPlay message:", messageType, message.Data);
          console.log("[JellyfinWS] Has subscribers for", messageType, ":", this.subscribers.has(messageType), "count:", this.subscribers.get(messageType)?.size);
        }
        if (messageType && this.subscribers.has(messageType)) {
          this.subscribers.get(messageType)!.forEach((handler) => {
            handler(message.Data);
          });
        }
      } catch {
        // Malformed message — ignore
      }
    };

    this.socket.onclose = (event) => {
      console.log("[JellyfinWS] Closed:", event.code, event.reason);
      this.stopKeepAlive();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = (event) => {
      console.error("[JellyfinWS] Error:", event);
    };
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      this.sendMessage("KeepAlive");
    }, 30000);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Don't reconnect if page is hidden
    if (document.visibilityState === "hidden") {
      const handleVisible = () => {
        document.removeEventListener("visibilitychange", handleVisible);
        this.openConnection();
      };
      document.addEventListener("visibilitychange", handleVisible);
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.openConnection();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay,
    );
  }

  subscribe(messageType: string, handler: MessageHandler): () => void {
    if (!this.subscribers.has(messageType)) {
      this.subscribers.set(messageType, new Set());
    }
    this.subscribers.get(messageType)!.add(handler);
    console.log(`[JellyfinWS] Subscribed to ${messageType}, total handlers: ${this.subscribers.get(messageType)!.size}`);

    return () => {
      const deleted = this.subscribers.get(messageType)?.delete(handler);
      console.log(`[JellyfinWS] Unsubscribed from ${messageType}, deleted: ${deleted}, remaining: ${this.subscribers.get(messageType)?.size}`);
    };
  }

  sendMessage(messageType: string, data?: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ MessageType: messageType, ...data }));
    }
  }

  reconnectWithNewToken(serverUrl: string, token: string, deviceId: string) {
    this.disconnect();
    this.connect(serverUrl, token, deviceId);
  }

  disconnect() {
    this.intentionalClose = true;
    this.cleanup();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private cleanup() {
    this.stopKeepAlive();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const jellyfinWs = new JellyfinWebSocket();
