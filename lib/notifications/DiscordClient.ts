import { EventEmitter } from 'events';
import { Client, TextChannel, Message } from 'discord.js';

enum Command {
  GetBalance,
  GetFees,
}

interface DiscordClient {
  on(event: 'command', listener: (command: Command) => void): this;
  emit(event: 'command', command: Command): boolean;
}

class DiscordClient extends EventEmitter {
  private client: Client;

  private channel?: TextChannel = undefined;

  constructor(
    private token: string,
    private channelName: string,
    private prefix: string) {
    super();

    this.client = new Client();
  }

  public init = async () => {
    if (this.token === '') {
      throw 'no API token provided';
    }

    await this.client.login(this.token);

    const { channels } = this.client;

    for (const channel of channels.values()) {
      if (channel instanceof TextChannel) {
        if (channel.name === this.channelName) {
          this.channel = channel;
        }
      }
    }

    if (!this.channel) {
      throw `Could not find Discord channel: ${this.channelName}`;
    }

    await this.listenForCommands();
  }

  public sendMessage = async (message: string) => {
    if (this.channel) {
      await this.channel.send(`[${this.prefix}]: ${message}`);
    }
  }

  private listenForCommands = async () => {
    if (this.channel) {
      this.client.on('message', (message: Message) => {
        if (message.author.bot) return;

        if (message.channel.id === this.channel!.id) {
          const command = this.parseMessage(message.content);

          if (command !== undefined) {
            this.emit('command', command);
          }
        }
      });
    }
  }

  private parseMessage = (message: string): Command | undefined => {
    switch (message.toLowerCase()) {
      case 'getbalance':
        return Command.GetBalance;

      case 'getfees':
        return Command.GetFees;

      default:
        return undefined;
    }
  }
}

export default DiscordClient;
export { Command };
