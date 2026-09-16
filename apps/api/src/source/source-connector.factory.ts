import { SourceConnector } from './source.connector.js';
import { SourceHttpClient } from './source-http.client.js';

export type SourceConnectorFactoryConfig = {
  baseUrl: string;
  login: string;
  password: string;
  allowInsecureForTests: boolean;
  insecureTestHostname?: string;
};

export class SourceConnectorFactory {
  constructor(private readonly config: SourceConnectorFactoryConfig) {}

  create(): SourceConnector {
    return new SourceConnector(
      new SourceHttpClient(this.config.baseUrl, {
        allowInsecureForTests: this.config.allowInsecureForTests,
        ...(this.config.insecureTestHostname
          ? { insecureTestHostname: this.config.insecureTestHostname }
          : {}),
      }),
      { login: this.config.login, password: this.config.password },
    );
  }
}
