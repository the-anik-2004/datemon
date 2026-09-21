import { Injectable, Logger } from "@nestjs/common";
import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";

export interface PushResult{
    success: boolean;
    ticketId?: string;
    error?:string;
}


@Injectable()
export class PushService{
    private readonly logger = new Logger(PushService.name);
    private readonly expo= new Expo();

    
  /**
   * Send a push message to a list of Expo tokens.
   * Returns a per-message result so the caller can decide overall status.
   */

  async send(
    tokens: string[],
    title: string,
    body:string,
    data?:Record<string,unknown>
  ):Promise<PushResult[]>{

    if (tokens.length===0) return[];

        // 1. Filter out invalid tokens — Expo throws on these
    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
    const invalidTokens = tokens.filter((t) => !Expo.isExpoPushToken(t));

    const results: PushResult[] = invalidTokens.map(() => ({
      success: false,
      error: 'Invalid Expo push token',
    }));

    if (validTokens.length === 0) return results;

    // 2. Build the messages
    const messages: ExpoPushMessage[] = validTokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: data ?? {},
      priority: 'high',
      channelId: 'default', // Android channel
    }));

    // 3. Send in chunks (Expo allows up to 100 per request)
    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const tickets: ExpoPushTicket[] =
          await this.expo.sendPushNotificationsAsync(chunk);

        for (const ticket of tickets) {
          if (ticket.status === 'ok') {
            results.push({ success: true, ticketId: ticket.id });
          } else {
            results.push({
              success: false,
              error: ticket.message ?? 'Unknown Expo error',
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown push error';
        this.logger.error(`Expo send failed: ${message}`);
        // Mark all tokens in this chunk as failed
        for (let index = 0; index < chunk.length; index += 1) {
          results.push({ success: false, error: message });
        }
      }
    }

    return results;
  }
}