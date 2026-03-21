import { ParamType } from '../../ops';
import type { ParamDef } from '../../ops';

export const sLog = (x: number): number => Math.sign(x) * Math.log1p(Math.abs(x));
export const sExp = (y: number): number => Math.sign(y) * Math.expm1(Math.abs(y));

export interface ParamScale {
  isLog: boolean;
  toSlider: (v: number) => number;
  fromSlider: (t: number) => number;
  fmt: (v: number) => string;
}

export function makeParamScale(param: ParamDef): ParamScale {
  const isLog = param.type === ParamType.log;
  const logMin = isLog ? sLog(param.min) : 0;
  const logRange = isLog ? sLog(param.max) - logMin : 0;
  return {
    isLog,
    toSlider: (v) => (isLog ? (100 * (sLog(v) - logMin)) / logRange : v),
    fromSlider: (t) => (isLog ? sExp(logMin + (t / 100) * logRange) : t),
    fmt: (v) => {
      if (isLog) return String(parseFloat(v.toPrecision(3)));
      const dec = param.step !== undefined ? (String(param.step).split('.')[1] ?? '').length : 0;
      return dec === 0 ? String(Math.round(v)) : parseFloat(v.toFixed(dec)).toString();
    },
  };
}
