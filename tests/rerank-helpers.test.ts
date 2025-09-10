/**
 * Rerank helpers unit tests
 * Tests the core reranking functionality for OpenAI-compatible and Cohere services
 */

import { rerankWithOpenAI, rerankWithCohere } from '../nodes/shared/rerank.helpers';
import { 
  createMockExecuteFunctions, 
  mockDocuments, 
  mockQuery, 
  mockOpenAIResponse, 
  mockCohereResponse,
  createMockHttpError
} from './helpers/mock-helpers';
import { NodeApiError } from 'n8n-workflow';

describe('Rerank Helper Functions', () => {
  
  describe('rerankWithOpenAI', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false, // Disable cache for pure unit testing
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'BAAI/bge-reranker-v2-m3'
      });
    });

    test('should make correct API call with proper parameters', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        5,
        0.5,
        0,
        false
      );

      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: 'http://localhost:8000/v1/rerank',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: {
          model: 'BAAI/bge-reranker-v2-m3',
          query: mockQuery,
          documents: [
            'The quick brown fox jumps over the lazy dog',
            'Machine learning is a subset of artificial intelligence',
            'Natural language processing enables computers to understand human language',
            'Deep learning uses neural networks with multiple layers',
            JSON.stringify({ title: 'Custom Document', data: { value: 'This should be stringified' }, metadata: { source: 'doc5' } })
          ],
          top_n: 5
        },
        json: true,
      });
    });

    test('should process document text fields in correct priority order', async () => {
      const testDocs = [
        { pageContent: 'pageContent', text: 'text', content: 'content', document: 'document' },
        { text: 'text', content: 'content', document: 'document' },
        { content: 'content', document: 'document' },
        { document: 'document' },
        { title: 'no standard fields' }
      ];

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
          { index: 2, relevance_score: 0.7 },
          { index: 3, relevance_score: 0.6 },
          { index: 4, relevance_score: 0.5 }
        ]
      });

      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        testDocs,
        5,
        0.0,
        0,
        false
      );

      const call = mockExecuteFunctions.helpers.httpRequest.mock.calls[0][0];
      expect(call.body.documents).toEqual([
        'pageContent',
        'text',
        'content',
        'document',
        JSON.stringify({ title: 'no standard fields' })
      ]);
    });

    test('should properly process results with threshold filtering', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.7, // High threshold
        0,
        false
      );

      // Only documents with score >= 0.7 should be returned
      result.forEach(doc => {
        expect(doc._rerankScore).toBeGreaterThanOrEqual(0.7);
      });

      // Should be sorted by score descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i-1]._rerankScore).toBeGreaterThanOrEqual(result[i]._rerankScore);
      }
    });

    test('should include original scores when requested', async () => {
      const docsWithScores = mockDocuments.map((doc, index) => ({
        ...doc,
        _originalScore: 0.1 * (index + 1)
      }));

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        docsWithScores,
        10,
        0.0,
        0,
        true // includeOriginalScores = true
      );

      result.forEach(doc => {
        expect(doc).toHaveProperty('_originalScore');
        expect(typeof doc._originalScore).toBe('number');
      });
    });

    test('should handle API errors correctly', async () => {
      const apiError = createMockHttpError(500, 'Internal Server Error', { error: 'Model not found' });
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(apiError);

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(networkError);

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });

    test('should limit top_n to document count', async () => {
      const smallDocSet = mockDocuments.slice(0, 2);
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 }
        ]
      });

      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        smallDocSet,
        10, // topK > document count
        0.0,
        0,
        false
      );

      const call = mockExecuteFunctions.helpers.httpRequest.mock.calls[0][0];
      expect(call.body.top_n).toBe(2); // Should be limited to document count
    });
  });

  describe('rerankWithCohere', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false,
        cohereModel: 'rerank-v3.5'
      });
    });

    test('should make correct API call to Cohere', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      await rerankWithCohere.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        5,
        0.5,
        0,
        false
      );

      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://api.cohere.ai/v1/rerank',
        headers: {
          Authorization: 'Bearer mock-cohere-api-key',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: {
          model: 'rerank-v3.5',
          query: mockQuery,
          documents: [
            'The quick brown fox jumps over the lazy dog',
            'Machine learning is a subset of artificial intelligence',
            'Natural language processing enables computers to understand human language',
            'Deep learning uses neural networks with multiple layers',
            JSON.stringify({ title: 'Custom Document', data: { value: 'This should be stringified' }, metadata: { source: 'doc5' } })
          ],
          top_n: 5
        },
        json: true,
      });
    });

    test('should handle custom model parameter', async () => {
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        if (param === 'cohereModel') return 'custom';
        if (param === 'cohereCustomModel') return 'my-custom-model';
        if (param === 'enableCache') return false;
        return undefined;
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      await rerankWithCohere.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        5,
        0.5,
        0,
        false
      );

      const call = mockExecuteFunctions.helpers.httpRequest.mock.calls[0][0];
      expect(call.body.model).toBe('my-custom-model');
    });

    test('should process Cohere response format correctly', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      const result = await rerankWithCohere.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Verify Cohere's 'score' field is properly mapped to '_rerankScore'
      expect(result[0]._rerankScore).toBe(0.92); // Highest score from mock
      expect(result).toHaveLength(mockCohereResponse.results.length);
      
      // Should be sorted by score descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i-1]._rerankScore).toBeGreaterThanOrEqual(result[i]._rerankScore);
      }
    });

    test('should handle credential fallback', async () => {
      // Mock primary credential failing, fallback should work
      mockExecuteFunctions.getCredentials.mockImplementation((type: string) => {
        if (type === 'cohereApi') {
          return Promise.reject(new Error('Primary credential not found'));
        }
        if (type === 'cohereRerankerApi') {
          return Promise.resolve({ apiKey: 'fallback-api-key' });
        }
        return Promise.reject(new Error(`Unknown credential type: ${type}`));
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      await rerankWithCohere.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        5,
        0.0,
        0,
        false
      );

      const call = mockExecuteFunctions.helpers.httpRequest.mock.calls[0][0];
      expect(call.headers.Authorization).toBe('Bearer fallback-api-key');
    });

    test('should handle Cohere API errors', async () => {
      const cohereError = createMockHttpError(429, 'Rate limit exceeded', {
        message: 'Too many requests'
      });
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(cohereError);

      await expect(rerankWithCohere.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });
  });

  describe('Edge Cases and Data Validation', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should handle empty document array gracefully', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({ results: [] });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        [],
        10,
        0.0,
        0,
        false
      );

      expect(result).toEqual([]);
      
      const call = mockExecuteFunctions.helpers.httpRequest.mock.calls[0][0];
      expect(call.body.documents).toEqual([]);
      expect(call.body.top_n).toBe(0);
    });

    test('should handle documents with only metadata', async () => {
      const metadataOnlyDocs = [
        { metadata: { title: 'Document 1' }, id: 'doc1' },
        { metadata: { title: 'Document 2' }, id: 'doc2' }
      ];

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: 0, relevance_score: 0.8 },
          { index: 1, relevance_score: 0.6 }
        ]
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        metadataOnlyDocs,
        10,
        0.0,
        0,
        false
      );

      expect(result).toHaveLength(2);
      
      const call = mockExecuteFunctions.helpers.httpRequest.mock.calls[0][0];
      expect(call.body.documents).toEqual([
        JSON.stringify(metadataOnlyDocs[0]),
        JSON.stringify(metadataOnlyDocs[1])
      ]);
    });

    test('should handle invalid API response format', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        // Missing results array
        data: 'invalid format'
      });

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      )).rejects.toThrow();
    });

    test('should preserve original document structure in results', async () => {
      const complexDocs = [
        {
          pageContent: 'Test content',
          metadata: { source: 'test.pdf', page: 1 },
          id: 'doc-123',
          customField: 'custom value'
        }
      ];

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.9 }]
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        complexDocs,
        10,
        0.0,
        0,
        false
      );

      expect(result[0]).toEqual({
        pageContent: 'Test content',
        metadata: { source: 'test.pdf', page: 1 },
        id: 'doc-123',
        customField: 'custom value',
        _rerankScore: 0.9,
        _originalIndex: 0
      });
    });
  });
});