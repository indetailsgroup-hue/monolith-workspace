/** FP-1 (ADR-062) underlay store — clamp/lock/no-manufacturing-linkage */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUnderlayStore } from '../useUnderlayStore';

describe('useUnderlayStore', () => {
  beforeEach(() => {
    const s = useUnderlayStore.getState();
    s.clearImage(); s.setLocked(false); s.setOpacity(0.5); s.setVisible(true);
    useUnderlayStore.setState({ widthMm: 4000, position: [0, 0], rotationDeg: 0 });
  });

  it('setImage เก็บ dataURL + aspect และเปิด visible', () => {
    useUnderlayStore.getState().setImage('data:image/png;base64,x', 'plan.png', 0.75);
    const s = useUnderlayStore.getState();
    expect(s.fileName).toBe('plan.png');
    expect(s.aspect).toBe(0.75);
    expect(s.visible).toBe(true);
  });

  it('aspect ไม่ valid → fallback 1', () => {
    useUnderlayStore.getState().setImage('d', 'p', NaN);
    expect(useUnderlayStore.getState().aspect).toBe(1);
  });

  it('clamp: opacity 0.05–1, widthMm 100–100000', () => {
    const s = useUnderlayStore.getState();
    s.setOpacity(0); expect(useUnderlayStore.getState().opacity).toBe(0.05);
    s.setOpacity(5); expect(useUnderlayStore.getState().opacity).toBe(1);
    s.setWidthMm(1); expect(useUnderlayStore.getState().widthMm).toBe(100);
    s.setWidthMm(9e9); expect(useUnderlayStore.getState().widthMm).toBe(100000);
  });

  it('locked กัน width/position/rotation แต่ไม่กัน opacity/visible', () => {
    const s = useUnderlayStore.getState();
    s.setLocked(true);
    s.setWidthMm(5000); s.setPosition(9, 9); s.setRotationDeg(45);
    expect(useUnderlayStore.getState().widthMm).toBe(4000);
    expect(useUnderlayStore.getState().position).toEqual([0, 0]);
    expect(useUnderlayStore.getState().rotationDeg).toBe(0);
    s.setOpacity(0.9);
    expect(useUnderlayStore.getState().opacity).toBe(0.9);
  });

  it('rotation normalize 0–360', () => {
    useUnderlayStore.getState().setRotationDeg(-90);
    expect(useUnderlayStore.getState().rotationDeg).toBe(270);
  });
});
