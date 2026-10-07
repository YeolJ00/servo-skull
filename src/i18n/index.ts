import { en } from './en.ts';

export type Strings = typeof en;

// One language for now. A later language switcher swaps this object.
export const t: Strings = en;
