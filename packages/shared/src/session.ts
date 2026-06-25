import { z } from 'zod';

export const SessionStatus = z.enum([
  'created',
  'booting',
  'ready',
  'running',
  'paused',
  'terminated',
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const Session = z.object({
  id: z.string(),
  status: SessionStatus,
  model: z.string(),
  container_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Session = z.infer<typeof Session>;
