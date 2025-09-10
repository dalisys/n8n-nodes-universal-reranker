import { IExecuteFunctions, NodeApiError, NodeOperationError, JsonObject } from 'n8n-workflow';

interface CacheEntry {
  results: any[];
  timestamp: number;
}

const rerankCache = new Map<string, CacheEntry>();

// Export for testing purposes
export function clearCache(): void {
  rerankCache.clear();
}

function createCacheKey(query: string, docs: any[], service: string, model: string): string {
  const documentTexts = docs.map(d => d?.pageContent || d?.text || d?.content || d?.document || JSON.stringify(d));
  const docsString = JSON.stringify(documentTexts);
  
  // Simple hash function for cache key generation
  const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  };
  
  const queryHash = simpleHash(query);
  const docsHash = simpleHash(docsString);
  return `${service}:${model}:${queryHash}:${docsHash}`;
}

function getCachedResult(key: string, ttlMinutes: number): any[] | null {
  const cached = rerankCache.get(key);
  const ttlMs = ttlMinutes * 60 * 1000;
  
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.results;
  }
  
  if (cached) {
    rerankCache.delete(key);
  }
  
  return null;
}

function setCachedResult(key: string, results: any[]): void {
  rerankCache.set(key, { results, timestamp: Date.now() });
  
  if (rerankCache.size > 1000) {
    const firstKey = rerankCache.keys().next().value;
    if (firstKey) {
      rerankCache.delete(firstKey);
    }
  }
}

function processRerankResults(
  self: IExecuteFunctions,
  results: any[],
  originalDocs: any[],
  threshold: number,
  includeOriginalScores: boolean,
): any[] {
  if (!results || !Array.isArray(results)) {
    throw new NodeOperationError(self.getNode(), 'Invalid reranking results: expected array of results');
  }

  return results
    .filter((r) => (r.relevance_score || r.score || 0) >= threshold)
    .map((r) => {
      const originalDoc = originalDocs[r.index];
      const score = r.relevance_score || r.score || 0;

      const result: any = {
        ...originalDoc,
        _rerankScore: score,
        _originalIndex: r.index,
      };

      if (includeOriginalScores && originalDoc._originalScore !== undefined) {
        result._originalScore = originalDoc._originalScore;
      }

      return result;
    })
    .sort((a, b) => b._rerankScore - a._rerankScore);
}

export async function rerankWithOpenAI(
  this: IExecuteFunctions,
  query: string,
  docs: any[],
  topK: number,
  threshold: number,
  itemIndex: number,
  includeOriginalScores: boolean,
): Promise<any[]> {
  const endpoint = this.getNodeParameter('endpoint', itemIndex) as string;
  const model = this.getNodeParameter('model', itemIndex) as string;
  const enableCache = this.getNodeParameter('enableCache', itemIndex, false) as boolean;
  const cacheTtl = this.getNodeParameter('cacheTtl', itemIndex, 5) as number;

  if (enableCache) {
    const cacheKey = createCacheKey(query, docs, 'openai-compatible', model);
    const cached = getCachedResult(cacheKey, cacheTtl);
    if (cached) {
      return cached
        .filter(doc => doc._rerankScore >= threshold)
        .slice(0, topK);
    }
  }

  const documentTexts = docs.map((d) =>
    d?.pageContent || d?.text || d?.content || d?.document || JSON.stringify(d),
  );

  try {
    const response = await this.helpers.httpRequest({
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: {
        model,
        query,
        documents: documentTexts,
        top_n: Math.min(topK, docs.length),
      },
      json: true,
    });

    const results = processRerankResults(this, response.results, docs, threshold, includeOriginalScores);
    
    if (enableCache) {
      const cacheKey = createCacheKey(query, docs, 'openai-compatible', model);
      setCachedResult(cacheKey, results);
    }
    
    return results;
  } catch (error) {
    const err: any = error;
    if (err?.response?.body) {
      throw new NodeApiError(this.getNode(), err, {
        message: `API Error (${err.response.statusCode})`,
        description: JSON.stringify(err.response.body),
      });
    }
    throw new NodeApiError(this.getNode(), err as JsonObject, {
      message: 'Request failed',
      description: (err as Error).message,
    });
  }
}

export async function rerankWithCohere(
  this: IExecuteFunctions,
  query: string,
  docs: any[],
  topK: number,
  threshold: number,
  itemIndex: number,
  includeOriginalScores: boolean,
): Promise<any[]> {
  // Prefer the official Cohere credential if available; fallback to legacy custom credential
  let credentials: any;
  try {
    credentials = await this.getCredentials('cohereApi');
  } catch (e) {
    credentials = await this.getCredentials('cohereRerankerApi');
  }
  const cohereModel = this.getNodeParameter('cohereModel', itemIndex) as string;
  const model = cohereModel === 'custom' 
    ? this.getNodeParameter('cohereCustomModel', itemIndex) as string 
    : cohereModel;
  const enableCache = this.getNodeParameter('enableCache', itemIndex, false) as boolean;
  const cacheTtl = this.getNodeParameter('cacheTtl', itemIndex, 5) as number;

  if (enableCache) {
    const cacheKey = createCacheKey(query, docs, 'cohere', model);
    const cached = getCachedResult(cacheKey, cacheTtl);
    if (cached) {
      return cached
        .filter(doc => doc._rerankScore >= threshold)
        .slice(0, topK);
    }
  }

  const documentTexts = docs.map((d) =>
    d?.pageContent || d?.text || d?.content || d?.document || JSON.stringify(d),
  );

  try {
    const response = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://api.cohere.ai/v1/rerank',
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: {
        model,
        query,
        documents: documentTexts,
        top_n: Math.min(topK, docs.length),
      },
      json: true,
    });

    const results = processRerankResults(this, response.results, docs, threshold, includeOriginalScores);
    
    if (enableCache) {
      const cacheKey = createCacheKey(query, docs, 'cohere', model);
      setCachedResult(cacheKey, results);
    }
    
    return results;
  } catch (error) {
    const err: any = error;
    if (err?.response?.body) {
      throw new NodeApiError(this.getNode(), err, {
        message: `Cohere API Error (${err.response.statusCode})`,
        description: JSON.stringify(err.response.body),
      });
    }
    throw new NodeApiError(this.getNode(), err as JsonObject, {
      message: 'Cohere request failed',
      description: (err as Error).message,
    });
  }
}