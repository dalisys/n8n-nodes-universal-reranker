/**
 * Universal Reranker Provider node tests
 * Tests the AI provider node functionality including caching
 */

import { UniversalRerankerProvider } from '../nodes/UniversalRerankerProvider/UniversalRerankerProvider.node';
import { clearCache } from '../nodes/shared/rerank.helpers';
import { mockDocuments, mockQuery, mockOpenAIResponse, mockCohereResponse } from './helpers/mock-helpers';
import { ISupplyDataFunctions, SupplyData } from 'n8n-workflow';

// Mock ISupplyDataFunctions for provider testing
function createMockSupplyDataFunctions(nodeParameters: Record<string, any> = {}): any {
  return {
    getNode: jest.fn().mockReturnValue({
      id: 'test-provider-node',
      name: 'Test Universal Reranker Provider',
      type: 'universalRerankerProvider',
      typeVersion: 1,
      position: [0, 0],
      parameters: nodeParameters
    }),
    
    getNodeParameter: jest.fn().mockImplementation((parameterName: string, itemIndex?: number) => {
      const value = nodeParameters[parameterName];
      return value !== undefined ? value : undefined;
    }),
    
    getCredentials: jest.fn().mockImplementation((type: string) => {
      if (type === 'cohereApi' || type === 'cohereRerankerApi') {
        return Promise.resolve({ apiKey: 'mock-cohere-api-key' });
      }
      return Promise.reject(new Error(`Unknown credential type: ${type}`));
    }),
    
    helpers: {
      httpRequest: jest.fn().mockResolvedValue({})
    } as any,
    
    addInputData: jest.fn().mockReturnValue({ index: 0 }),
    addOutputData: jest.fn(),
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
  };
}

describe('UniversalRerankerProvider Node', () => {
  let provider: UniversalRerankerProvider;
  let mockSupplyDataFunctions: any;

  beforeEach(() => {
    provider = new UniversalRerankerProvider();
    jest.clearAllMocks();
    clearCache();
  });

  describe('Node Configuration', () => {
    test('should have correct node description properties', () => {
      expect(provider.description.displayName).toBe('Universal Reranker Provider');
      expect(provider.description.name).toBe('universalRerankerProvider');
      expect(provider.description.group).toContain('transform');
      expect(provider.description.version).toBe(1);
    });

    test('should include cache parameters', () => {
      const propertyNames = provider.description.properties.map(p => p.name);
      
      expect(propertyNames).toContain('enableCache');
      expect(propertyNames).toContain('cacheTtl');
    });

    test('should have cache TTL parameter only visible when caching enabled', () => {
      const cacheTtlProperty = provider.description.properties.find(p => p.name === 'cacheTtl');
      
      expect(cacheTtlProperty?.displayOptions?.show?.enableCache).toEqual([true]);
    });
  });

  describe('Provider Supply Data', () => {
    test('should supply a reranker provider with OpenAI service', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 5,
        threshold: 0.5,
        includeOriginalScores: false,
        enableCache: false
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await provider.supplyData.call(mockSupplyDataFunctions, 0);

      expect(result).toHaveProperty('response');
      const rerankerProvider = result.response as any;
      expect(rerankerProvider).toHaveProperty('rerank');
      expect(rerankerProvider).toHaveProperty('compressDocuments');
      expect(typeof rerankerProvider.rerank).toBe('function');
      expect(typeof rerankerProvider.compressDocuments).toBe('function');
    });

    test('should supply a reranker provider with Cohere service', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'cohere',
        cohereModel: 'rerank-v3.5',
        topK: 5,
        threshold: 0.5,
        includeOriginalScores: false,
        enableCache: false
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      const result = await provider.supplyData.call(mockSupplyDataFunctions, 0);

      expect(result).toHaveProperty('response');
      const rerankerInstance = result.response as any;
      expect(rerankerInstance).toHaveProperty('rerank');
      expect(typeof rerankerInstance.rerank).toBe('function');
    });
  });

  describe('Rerank Functionality', () => {
    test('should rerank documents using OpenAI service', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.0,
        includeOriginalScores: false,
        enableCache: false
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      const result = await reranker.rerank({
        query: mockQuery,
        documents: mockDocuments,
        topN: 5,
        threshold: 0.5
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('_rerankScore');
      expect(result[0]).toHaveProperty('_originalIndex');
      
      // Verify API call was made
      expect(mockSupplyDataFunctions.helpers.httpRequest).toHaveBeenCalledTimes(1);
    });

    test('should rerank documents using Cohere service', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'cohere',
        cohereModel: 'rerank-v3.5',
        topK: 10,
        threshold: 0.0,
        includeOriginalScores: false,
        enableCache: false
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      const result = await reranker.rerank({
        query: mockQuery,
        documents: mockDocuments,
        topN: 3
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Verify API call was made
      expect(mockSupplyDataFunctions.helpers.httpRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('Caching in Provider Node', () => {
    test('should cache results when caching is enabled', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.0,
        includeOriginalScores: false,
        enableCache: true,
        cacheTtl: 5
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      // First call - should make API request
      const result1 = await reranker.rerank({
        query: mockQuery,
        documents: mockDocuments,
        topN: 5
      });

      // Second call with same parameters - should use cache
      const result2 = await reranker.rerank({
        query: mockQuery,
        documents: mockDocuments,
        topN: 5
      });

      // Should only make one API call (second call uses cache)
      expect(mockSupplyDataFunctions.helpers.httpRequest).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    test('should not use cache when caching is disabled', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.0,
        includeOriginalScores: false,
        enableCache: false // Cache disabled
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      // First call
      await reranker.rerank({
        query: mockQuery,
        documents: mockDocuments,
        topN: 5
      });

      // Second call with same parameters
      await reranker.rerank({
        query: mockQuery,
        documents: mockDocuments,
        topN: 5
      });

      // Should make two API calls (cache disabled)
      expect(mockSupplyDataFunctions.helpers.httpRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('LangChain Compatibility', () => {
    test('should provide compressDocuments method for LangChain compatibility', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.0,
        includeOriginalScores: false,
        enableCache: false
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      const result = await reranker.compressDocuments(mockDocuments, mockQuery, 3);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // LangChain compatibility - should NOT have helper fields
      result.forEach((doc: any) => {
        expect(doc).not.toHaveProperty('_rerankScore');
        expect(doc).not.toHaveProperty('_originalIndex');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle empty query', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      await expect(reranker.rerank({
        query: '', // Empty query
        documents: mockDocuments
      })).rejects.toThrow();
    });

    test('should handle empty documents array', async () => {
      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      const result = await reranker.rerank({
        query: mockQuery,
        documents: [] // Empty array
      });

      expect(result).toEqual([]);
    });
  });

  describe('Document Processing', () => {
    test('should process various document formats', async () => {
      const mixedDocs = [
        { pageContent: 'Page content doc' },
        { text: 'Text field doc' },
        { content: 'Content field doc' },
        { document: 'Document field doc' },
        'String document',
        { customField: 'Custom doc without standard fields' }
      ];

      mockSupplyDataFunctions = createMockSupplyDataFunctions({
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.0,
        includeOriginalScores: false,
        enableCache: false
      });

      mockSupplyDataFunctions.helpers.httpRequest.mockResolvedValue({
        results: mixedDocs.map((_, index) => ({ index, relevance_score: 0.8 - (index * 0.1) }))
      });

      const supplyData = await provider.supplyData.call(mockSupplyDataFunctions, 0);
      const reranker = supplyData.response as any;

      const result = await reranker.rerank({
        query: 'test query',
        documents: mixedDocs
      });

      expect(result).toHaveLength(mixedDocs.length);
      
      // Verify documents were processed correctly
      expect(result[0].pageContent).toBe('Page content doc');
      expect(result[1].pageContent).toBe('Text field doc');
      expect(result[2].pageContent).toBe('Content field doc');
      expect(result[3].pageContent).toBe('Document field doc');
      expect(result[4].pageContent).toBe('String document');
    });
  });
});