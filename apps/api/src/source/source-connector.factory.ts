import { SourceConnector } from './source.connector.js';
import { SourceHttpClient } from './source-http.client.js';

export type SourceConnectorFactoryConfig = {
  baseUrl: string;
  login: string;
  password: string;
  allowInsecureForTests: boolean;
};

export class SourceConnectorFactory {
  constructor(private readonly config: SourceConnectorFactoryConfig) {}

  create(): SourceConnector {
    return new SourceConnector(
      new SourceHttpClient(this.config.baseUrl, {
        allowInsecureForTests: this.config.allowInsecureForTests,
      }),
      { login: this.config.login, password: this.config.password },
    );
  }
}
