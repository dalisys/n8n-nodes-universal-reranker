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
  let credentials: any = '';
  try {
    credentials = await this.getCredentials('openAiApi');
  } catch (e) {
    credentials = '';
  }

  const endpoint = this.getNodeParameter('endpoint', itemIndex) as string;
  const model = this.getNodeParameter('model', itemIndex) as string;
  const enableCache = this.getNodeParameter('enableCache', itemIndex, false) as boolean;
  const cacheTtl = this.getNodeParameter('cacheTtl', itemIndex, 5) as number;
  const enableCustomTemplates = this.getNodeParameter('enableCustomTemplates', itemIndex, false) as boolean;

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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (credentials && credentials.apiKey) {
      headers['Authorization'] = `Bearer ${credentials.apiKey}`;
    }

    // Format query and documents with templates if enabled
    let finalQuery: string = query;
    let finalDocuments: string[] = documentTexts;

    if (enableCustomTemplates) {
      // Get template configuration
      const templatePreset = this.getNodeParameter('templatePreset', itemIndex, 'qwen3') as string;

      let queryPrefix: string;
      let querySuffix: string;
      let documentPrefix: string;
      let documentSuffix: string;

      if (templatePreset === 'qwen3') {
        // Qwen3 Reranker default templates
        queryPrefix = '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n';
        querySuffix = '';
        documentPrefix = '';
        documentSuffix = '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n';
      } else {
        // Custom templates
        queryPrefix = this.getNodeParameter('queryPrefix', itemIndex, '') as string;
        querySuffix = this.getNodeParameter('querySuffix', itemIndex, '') as string;
        documentPrefix = this.getNodeParameter('documentPrefix', itemIndex, '') as string;
        documentSuffix = this.getNodeParameter('documentSuffix', itemIndex, '') as string;
      }

      if (templatePreset === 'qwen3') {
        // Qwen3 specific format with instruction and special tags
        const instruction = this.getNodeParameter('instruction', itemIndex, 'Given a web search query, retrieve relevant passages that answer the query') as string;
        finalQuery = `${queryPrefix}<Instruct>: ${instruction}\n<Query>: ${query}\n${querySuffix}`;
        finalDocuments = documentTexts.map(
          (doc) => `${documentPrefix}<Document>: ${doc}${documentSuffix}`
        );
      } else {
        // Pure custom templates - user has full control
        finalQuery = `${queryPrefix}${query}${querySuffix}`;
        finalDocuments = documentTexts.map(
          (doc) => `${documentPrefix}${doc}${documentSuffix}`
        );
      }
    }

    // Always use standard OpenAI rerank format
    const body = {
      model,
      query: finalQuery,
      documents: finalDocuments,
      top_n: Math.min(topK, docs.length),
    };

    const response = await this.helpers.httpRequest({
      method: 'POST',
      url: endpoint,
      headers,
      body,
      json: true,
    });

    // Parse standard rerank response
    const results = response.results;

    const processedResults = processRerankResults(this, results, docs, threshold, includeOriginalScores);

    if (enableCache) {
      const cacheKey = createCacheKey(query, docs, 'openai-compatible', model);
      setCachedResult(cacheKey, processedResults);
    }

    return processedResults;
  } catch (error) {
    const err: any = error;
    if (err?.response?.body) {
      throw new NodeApiError(this.getNode(), err, {
        message: `API Error (${err.response.statusCode})`,
        description: `Endpoint: ${endpoint}\nResponse: ${JSON.stringify(err.response.body, null, 2)}`,
      });
    }
    throw new NodeApiError(this.getNode(), err as JsonObject, {
      message: 'Request failed',
      description: `Endpoint: ${endpoint}\nError: ${(err as Error).message}\nStack: ${(err as Error).stack}`,
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
