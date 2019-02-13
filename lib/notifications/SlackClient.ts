import { EventEmitter } from 'events';
import { WebClient, RTMClient } from '@slack/client';

type Channel = {
  id: string;
  name: string;
};

type Message = {
  type: string;
  channel: string;

  text: string;
};

interface SlackClient {
  on(event: 'message', listener: (message: string) => void): this;
  emit(event: 'message', message: string): boolean;
}

class SlackClient extends EventEmitter {
  private rtm: RTMClient;
  private client: WebClient;

  private channelId = '';

  constructor(token: string, private channel: string, private name: string) {
    super();

    this.rtm = new RTMClient(token);
    this.client = new WebClient(token);
  }

  public init = async () => {
    const channelsReponse = await this.client.channels.list() as any;
    const channels = channelsReponse.channels as Channel[];

    channels.forEach((channel) => {
      if (channel.name === this.channel) {
        this.channelId = channel.id;
      }
    });
  }

  public sendMessage = async (message: string) => {
    await this.client.chat.postMessage({
      channel: this.channel,
      text: `[${this.name}]: ${message}`,
    });
  }

  public listenToMessages = async () => {
    await this.rtm.start();

    this.rtm.on('message', (message: Message) => {
      if (message.channel === this.channelId) {
        this.emit('message', message.text);
      }
    });
  }
}

export default SlackClient;
