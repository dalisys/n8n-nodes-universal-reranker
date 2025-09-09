import { IExecuteFunctions, NodeApiError, NodeOperationError, JsonObject } from 'n8n-workflow';

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

  const documentTexts = docs.map((d) =>
    d.pageContent || d.text || d.content || d.document || JSON.stringify(d),
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

    return processRerankResults(this, response.results, docs, threshold, includeOriginalScores);
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

  const documentTexts = docs.map((d) =>
    d.pageContent || d.text || d.content || d.document || JSON.stringify(d),
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

    return processRerankResults(this, response.results, docs, threshold, includeOriginalScores);
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