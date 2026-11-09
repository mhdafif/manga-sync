import { asuraAdapter } from './asura';
import { genericAdapter } from './generic';
import type { SiteAdapter } from '../core/types';

/** Site-specific adapters first; the generic one matches everything else. */
const ADAPTERS: SiteAdapter[] = [asuraAdapter, genericAdapter];

export function getAdapter(url: URL): SiteAdapter {
  return ADAPTERS.find((a) => a.matches(url)) ?? genericAdapter;
}
