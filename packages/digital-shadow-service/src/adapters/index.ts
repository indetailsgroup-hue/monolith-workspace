/**
 * MONOLITH Digital Shadow — Adapter Factory & Exports
 */

export { IMachineAdapter } from './IMachineAdapter';
export { BaseMachineAdapter } from './BaseMachineAdapter';
export { BiesseAdapter } from './BiesseAdapter';
export { HomagAdapter } from './HomagAdapter';
export { KdtAdapter } from './KdtAdapter';

import type { MachineEndpoint } from '../types/machine';
import { AdapterProtocol } from '../types/machine';
import type { IMachineAdapter } from './IMachineAdapter';
import { BiesseAdapter } from './BiesseAdapter';
import { HomagAdapter } from './HomagAdapter';
import { KdtAdapter } from './KdtAdapter';

/**
 * Factory function to create the appropriate adapter for a machine endpoint
 */
export function createAdapter(endpoint: MachineEndpoint): IMachineAdapter {
  switch (endpoint.protocol) {
    case AdapterProtocol.OPCUA_NATIVE:
      return new BiesseAdapter(endpoint);
    case AdapterProtocol.OPCUA_PLUS_CLOUD:
      return new HomagAdapter(endpoint);
    case AdapterProtocol.MODBUS_TCP:
      return new KdtAdapter(endpoint);
    default:
      throw new Error(`Unsupported adapter protocol: ${endpoint.protocol}`);
  }
}
