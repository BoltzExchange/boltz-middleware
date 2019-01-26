import { WebClient } from '@slack/client';

class SlackClient {
  private client: WebClient;

  constructor(token: string, private channel: string, private name: string) {
    this.client = new WebClient(token);
  }

  public sendMessage = async (message: string) => {
    await this.client.chat.postMessage({
      channel: this.channel,
      text: `[${this.name}]: ${message}`,
    });
  }
}

export default SlackClient;
