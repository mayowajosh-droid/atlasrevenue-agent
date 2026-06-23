import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import type OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';

export interface AppContext {
  db: Pool;
  redis: Redis | null;
  queues: {
    scanQueue: Queue;
    alertQueue: Queue;
    signalQueue: Queue;
  };
  caches: {
    memoryStore: Map<string, any>;
    deskCache: Map<string, any>;
    compilingDesks: Map<string, boolean>;
  };
  clients: {
    openai: OpenAI | null;
    anthropic: Anthropic | null;
  };
  entityResolver: {
    resolve: (raw: any) => Promise<any>;
    ingest: (payload: any, source: string) => Promise<any>;
  };
}

let globalContext: AppContext | null = null;

export function initContext(deps: Omit<AppContext, 'entityResolver'>): AppContext {
  const ctx: AppContext = {
    ...deps,
    entityResolver: {
      resolve: (raw) => import('./entities/resolver.js').then(m => m.resolveEntity(deps.db, raw)),
      ingest: (payload, source) => import('./entities/resolver.js').then(m => m.ingestRaw(deps.db, payload, source as any)),
    },
  };
  globalContext = ctx;
  return ctx;
}

export function getContext(): AppContext {
  if (!globalContext) throw new Error('Context not initialized');
  return globalContext;
}
