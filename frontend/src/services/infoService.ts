import type { Info } from '../types/info';
import { fetchOrThrow } from './http';

export async function getInfo(): Promise<Info> {
  const response = await fetchOrThrow('/info');
  return (await response.json()) as Info;
}
