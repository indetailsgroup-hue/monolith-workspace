/**
 * MachineShadow — Factory route page for Digital Shadow view
 *
 * Wraps MachineShadowPanel in the factory chrome (full viewport).
 *
 * @version 1.0.0
 */
import React from 'react';
import { MachineShadowPanel } from '../components/shadow/MachineShadowPanel';

export function MachineShadow(): React.ReactElement {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <MachineShadowPanel />
    </div>
  );
}

export default MachineShadow;
