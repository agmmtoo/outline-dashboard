// Shapes from the Outline Server Management API spec:
// https://github.com/OutlineFoundation/outline-server/blob/master/src/shadowbox/server/api.yml

export interface DataLimit {
  bytes: number;
}

export interface ServerInfo {
  name: string;
  serverId: string;
  metricsEnabled: boolean;
  createdTimestampMs: number;
  version: string;
  portForNewAccessKeys: number;
  hostnameForAccessKeys: string;
  accessKeyDataLimit?: DataLimit;
}

export interface AccessKey {
  id: string;
  name: string;
  password: string;
  port: number;
  method: string;
  accessUrl: string;
  dataLimit?: DataLimit;
}

export interface CreateAccessKeyInput {
  name?: string;
  method?: string;
  password?: string;
  port?: number;
  limit?: DataLimit;
}

export interface TransferMetrics {
  bytesTransferredByUserId: Record<string, number>;
}

interface TimedValue<T> {
  data: T;
  timestamp: number;
}

export interface ExperimentalMetrics {
  server: {
    tunnelTime: { seconds: number };
    dataTransferred: { bytes: number };
    bandwidth?: {
      current: TimedValue<{ bytes: number }>;
      peak: TimedValue<{ bytes: number }>;
    };
    locations?: Array<{
      location: string;
      asn: number | null;
      asOrg: string | null;
      tunnelTime: { seconds: number };
      dataTransferred: { bytes: number };
    }>;
  };
  accessKeys: Array<{
    accessKeyId: number;
    tunnelTime: { seconds: number };
    dataTransferred: { bytes: number };
    connection?: {
      // Unix seconds.
      lastTrafficSeen?: number | null;
      peakDeviceCount?: TimedValue<number>;
    };
  }>;
}
