/**
 * Cache functionality tests
 * Tests the in-memory caching system for rerank results
 */

import { rerankWithOpenAI, rerankWithCohere, clearCache } from '../nodes/shared/rerank.helpers';
import { createMockExecuteFunctions, mockDocuments, mockQuery, mockOpenAIResponse, mockCohereResponse } from './helpers/mock-helpers';

describe('Cache Functionality', () => {
  let mockExecuteFunctions: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Clear the in-memory cache
    clearCache();
  });

  describe('Cache Key Generation', () => {
    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: true,
        cacheTtl: 5,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should generate same cache key for identical queries and documents', async () => {
      // Mock successful API responses
      mockExecuteFunctions.helpers.httpRequest
        .mockResolvedValueOnce(mockOpenAIResponse)
        .mockResolvedValueOnce(mockOpenAIResponse);

      // First call - should make API request
      const result1 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Second call with same parameters - should use cache
      const result2 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Should only make one API call (second call uses cache)
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    test('should generate different cache keys for different queries', async () => {
      mockExecuteFunctions.helpers.httpRequest
        .mockResolvedValueOnce(mockOpenAIResponse)
        .mockResolvedValueOnce(mockOpenAIResponse);

      // First call
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        'first query',
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Second call with different query
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        'second query',
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Should make two API calls (different cache keys)
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(2);
    });

    test('should generate different cache keys for different documents', async () => {
      const differentDocuments = [
        { pageContent: 'Different document content' }
      ];

      mockExecuteFunctions.helpers.httpRequest
        .mockResolvedValueOnce(mockOpenAIResponse)
        .mockResolvedValueOnce(mockOpenAIResponse);

      // First call
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Second call with different documents
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        differentDocuments,
        10,
        0.0,
        0,
        false
      );

      // Should make two API calls (different cache keys)
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(2);
    });

    test('should generate different cache keys for different models', async () => {
      mockExecuteFunctions.helpers.httpRequest
        .mockResolvedValueOnce(mockOpenAIResponse)
        .mockResolvedValueOnce(mockOpenAIResponse);

      // First call
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Change model parameter
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        if (param === 'model') return 'different-model';
        if (param === 'enableCache') return true;
        if (param === 'cacheTtl') return 5;
        if (param === 'endpoint') return 'http://localhost:8000/v1/rerank';
      });

      // Second call with different model
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Should make two API calls (different cache keys)
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache TTL (Time To Live)', () => {
    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: true,
        cacheTtl: 1, // 1 minute TTL for testing
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should serve from cache within TTL period', async () => {
      mockExecuteFunctions.helpers.httpRequest
        .mockResolvedValueOnce(mockOpenAIResponse);

      // First call
      const result1 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Second call immediately after (within TTL)
      const result2 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    test('should expire cache after TTL period', async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      const mockTime = 1000000;
      Date.now = jest.fn().mockReturnValue(mockTime);

      mockExecuteFunctions.helpers.httpRequest
        .mockResolvedValueOnce(mockOpenAIResponse)
        .mockResolvedValueOnce(mockOpenAIResponse);

      try {
        // First call
        await rerankWithOpenAI.call(
          mockExecuteFunctions,
          mockQuery,
          mockDocuments,
          10,
          0.0,
          0,
          false
        );

        // Advance time beyond TTL (1 minute = 60000ms)
        Date.now = jest.fn().mockReturnValue(mockTime + 61000);

        // Second call after TTL expiry
        await rerankWithOpenAI.call(
          mockExecuteFunctions,
          mockQuery,
          mockDocuments,
          10,
          0.0,
          0,
          false
        );

        // Should make two API calls (cache expired)
        expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(2);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe('Cache Behavior with Different Services', () => {
    test('should maintain separate caches for OpenAI and Cohere services', async () => {
      const openAIMock = createMockExecuteFunctions({
        enableCache: true,
        cacheTtl: 5,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });

      const cohereMock = createMockExecuteFunctions({
        enableCache: true,
        cacheTtl: 5,
        cohereModel: 'rerank-v3.5'
      });

      openAIMock.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);
      cohereMock.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      // Call OpenAI service
      await rerankWithOpenAI.call(
        openAIMock,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Call Cohere service with same query/documents
      await rerankWithCohere.call(
        cohereMock,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Both should make API calls (different service caches)
      expect(openAIMock.helpers.httpRequest).toHaveBeenCalledTimes(1);
      expect(cohereMock.helpers.httpRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Disabled Behavior', () => {
    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false, // Cache disabled
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should not use cache when caching is disabled', async () => {
      mockExecuteFunctions.helpers.httpRequest
        .mockResolvedValueOnce(mockOpenAIResponse)
        .mockResolvedValueOnce(mockOpenAIResponse);

      // First call
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Second call with same parameters
      await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Should make two API calls (cache disabled)
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache with Threshold and TopK Filtering', () => {
    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: true,
        cacheTtl: 5,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should apply current threshold to cached results', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValueOnce(mockOpenAIResponse);

      // First call with low threshold
      const result1 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.1, // Low threshold - should return more results
        0,
        false
      );

      // Second call with higher threshold (should use cache but filter more strictly)
      const result2 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.8, // High threshold - should return fewer results
        0,
        false
      );

      // Should only make one API call
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(1);
      
      // Second result should have fewer items due to higher threshold
      expect(result2.length).toBeLessThan(result1.length);
      
      // All items in result2 should have score >= 0.8
      result2.forEach(doc => {
        expect(doc._rerankScore).toBeGreaterThanOrEqual(0.8);
      });
    });

    test('should apply current topK to cached results', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValueOnce(mockOpenAIResponse);

      // First call with high topK
      const result1 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        10,
        0.0,
        0,
        false
      );

      // Second call with lower topK (should use cache but limit results)
      const result2 = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        mockQuery,
        mockDocuments,
        2, // topK = 2
        0.0,
        0,
        false
      );

      // Should only make one API call
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(1);
      
      // Second result should be limited by topK
      expect(result2.length).toBeLessThanOrEqual(2);
      expect(result2.length).toBeLessThan(result1.length);
    });
  });
});