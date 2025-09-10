/**
 * Edge cases and error handling tests
 * Tests various edge cases, error conditions, and boundary scenarios
 */

import { rerankWithOpenAI, rerankWithCohere } from '../nodes/shared/rerank.helpers';
import { UniversalRerankerFlow } from '../nodes/UniversalRerankerFlow/UniversalRerankerFlow.node';
import { 
  createMockExecuteFunctions, 
  createMockHttpError 
} from './helpers/mock-helpers';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

describe('Edge Cases and Error Handling', () => {

  describe('Document Content Extraction Edge Cases', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should handle documents with null/undefined text content', async () => {
      const problematicDocs = [
        { pageContent: null, metadata: { id: 'doc1' } },
        { text: undefined, metadata: { id: 'doc2' } },
        { content: '', metadata: { id: 'doc3' } },
        { document: '   ', metadata: { id: 'doc4' } }, // Whitespace only
        null, // Completely null document
        undefined, // Undefined document
        { metadata: { id: 'doc5' } } // No text fields at all
      ];

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: 0, relevance_score: 0.8 },
          { index: 1, relevance_score: 0.7 },
          { index: 2, relevance_score: 0.6 },
          { index: 3, relevance_score: 0.5 },
          { index: 4, relevance_score: 0.4 },
          { index: 5, relevance_score: 0.3 },
          { index: 6, relevance_score: 0.2 }
        ]
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        problematicDocs,
        10,
        0.0,
        0,
        false
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Verify API was called with stringified versions of problematic docs
      const call = mockExecuteFunctions.helpers.httpRequest.mock.calls[0][0];
      expect(call.body.documents).toEqual([
        JSON.stringify({ pageContent: null, metadata: { id: 'doc1' } }),
        JSON.stringify({ text: undefined, metadata: { id: 'doc2' } }),
        JSON.stringify({ content: '', metadata: { id: 'doc3' } }),
        '   ',
        'null',
        undefined, // undefined documents become undefined in the map
        JSON.stringify({ metadata: { id: 'doc5' } })
      ]);
    });

    test('should handle circular reference objects gracefully', async () => {
      const circularDoc: any = { content: 'test content', metadata: {} };
      circularDoc.self = circularDoc; // Create circular reference

      const docs = [circularDoc];

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.8 }]
      });

      // This should not throw due to circular reference
      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        docs,
        10,
        0.0,
        0,
        false
      )).resolves.toBeDefined();
    });

    test('should handle very large document objects', async () => {
      const largeDoc = {
        pageContent: 'A'.repeat(100000), // Very large content
        metadata: {
          largeArray: Array.from({ length: 10000 }, (_, i) => `item-${i}`),
          largeObject: Object.fromEntries(
            Array.from({ length: 1000 }, (_, i) => [`key${i}`, `value${i}`])
          )
        }
      };

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.8 }]
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [largeDoc],
        10,
        0.0,
        0,
        false
      );

      expect(result).toBeDefined();
      expect(result[0].pageContent).toBe('A'.repeat(100000));
    });
  });

  describe('API Response Edge Cases', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should handle missing results array in API response', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        // Missing 'results' field
        status: 'success'
      });

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });

    test('should handle null results array', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: null
      });

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });

    test('should handle results with missing score fields', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: 0 }, // Missing relevance_score
          { index: 1, relevance_score: null }, // Null score
          { index: 2, relevance_score: undefined }, // Undefined score
          { index: 3, relevance_score: 'invalid' }, // Invalid score type
          { index: 4, relevance_score: 0.8 } // Valid score
        ]
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        Array.from({ length: 5 }, (_, i) => ({ pageContent: `doc ${i}` })),
        10,
        0.7, // Set threshold to filter out invalid scores (which default to 0)
        0,
        false
      );

      // Should handle invalid scores by defaulting to 0, only valid score >= 0.7 remains
      expect(result).toHaveLength(1); // Only the document with score 0.8 should remain after filtering
      expect(result[0]._rerankScore).toBe(0.8);
    });

    test('should handle results with invalid index values', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: -1, relevance_score: 0.9 }, // Negative index
          { index: 'invalid', relevance_score: 0.8 }, // String index
          { index: 100, relevance_score: 0.7 }, // Out of bounds index
          { index: 0, relevance_score: 0.6 } // Valid index
        ]
      });

      // Should not crash but may produce unexpected results
      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test doc' }],
        10,
        0.0,
        0,
        false
      )).resolves.toBeDefined();
    });

    test('should handle empty results array', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: []
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      );

      expect(result).toEqual([]);
    });
  });

  describe('Network and API Error Scenarios', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(timeoutError);

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });

    test('should handle connection refused errors', async () => {
      const connectionError = new Error('connect ECONNREFUSED');
      (connectionError as any).code = 'ECONNREFUSED';
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(connectionError);

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });

    test('should handle various HTTP status codes', async () => {
      const statusCodes = [400, 401, 403, 404, 429, 500, 502, 503, 504];

      for (const statusCode of statusCodes) {
        mockExecuteFunctions.helpers.httpRequest.mockRejectedValueOnce(
          createMockHttpError(statusCode, `HTTP ${statusCode} Error`, { 
            error: `Status ${statusCode} error message` 
          })
        );

        await expect(rerankWithOpenAI.call(
          mockExecuteFunctions,
          'test query',
          [{ pageContent: 'test' }],
          10,
          0.0,
          0,
          false
        )).rejects.toThrow(NodeApiError);
      }
    });

    test('should handle malformed JSON responses', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(
        createMockHttpError(200, 'Malformed JSON', 'not valid json')
      );

      await expect(rerankWithOpenAI.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });
  });

  describe('Cohere-Specific Error Scenarios', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false,
        cohereModel: 'rerank-v3.5'
      });
    });

    test('should handle missing API credentials', async () => {
      mockExecuteFunctions.getCredentials.mockRejectedValue(
        new Error('No credentials found')
      );

      await expect(rerankWithCohere.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(Error);
    });

    test('should handle invalid API key format', async () => {
      mockExecuteFunctions.getCredentials.mockResolvedValue({
        apiKey: '' // Empty API key
      });

      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(
        createMockHttpError(401, 'Invalid API key', { 
          message: 'API key is invalid' 
        })
      );

      await expect(rerankWithCohere.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });

    test('should handle Cohere-specific error responses', async () => {
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(
        createMockHttpError(400, 'Bad Request', {
          message: 'Model not found: invalid-model',
          type: 'invalid_request_error'
        })
      );

      await expect(rerankWithCohere.call(
        mockExecuteFunctions,
        'test query',
        [{ pageContent: 'test' }],
        10,
        0.0,
        0,
        false
      )).rejects.toThrow(NodeApiError);
    });
  });

  describe('Parameter Boundary Testing', () => {
    let node: UniversalRerankerFlow;
    let mockExecuteFunctions: any;

    beforeEach(() => {
      node = new UniversalRerankerFlow();
      mockExecuteFunctions = createMockExecuteFunctions({
        query: 'test query',
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should handle extreme topK values', async () => {
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        const params = {
          query: 'test query',
          documentsField: 'documents',
          service: 'openai-compatible',
          endpoint: 'http://localhost:8000/v1/rerank',
          model: 'test-model',
          topK: 999999, // Very large topK
          threshold: 0.0,
          enableCache: false,
          includeOriginalScores: false
        };
        return params[param as keyof typeof params];
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.8 }]
      });

      // Should not crash with extreme values
      await expect(node.execute.call(mockExecuteFunctions))
        .resolves.toBeDefined();
    });

    test('should handle negative threshold values', async () => {
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        const params = {
          query: 'test query',
          documentsField: 'documents', 
          service: 'openai-compatible',
          endpoint: 'http://localhost:8000/v1/rerank',
          model: 'test-model',
          topK: 10,
          threshold: -1.0, // Negative threshold
          enableCache: false,
          includeOriginalScores: false
        };
        return params[param as keyof typeof params];
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.8 }]
      });

      const result = await node.execute.call(mockExecuteFunctions);
      // Should include all results since negative threshold allows everything
      expect(result[0][0].json.rerankedDocs).toHaveLength(1);
    });

    test('should handle threshold values above 1.0', async () => {
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        const params = {
          query: 'test query',
          documentsField: 'documents',
          service: 'openai-compatible', 
          endpoint: 'http://localhost:8000/v1/rerank',
          model: 'test-model',
          topK: 10,
          threshold: 2.0, // Threshold > 1.0
          enableCache: false,
          includeOriginalScores: false
        };
        return params[param as keyof typeof params];
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.8 }]
      });

      const result = await node.execute.call(mockExecuteFunctions);
      // Should exclude all results since no score can be > 2.0
      expect(result[0][0].json.rerankedDocs).toHaveLength(0);
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    test('should handle cache size limits properly', async () => {
      // This would require modifying the cache size limit to a smaller value for testing
      // For now, we'll test conceptually by ensuring the cache doesn't grow indefinitely
      const mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: true,
        cacheTtl: 60,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.8 }]
      });

      // Make many unique requests to potentially trigger cache size limits
      for (let i = 0; i < 10; i++) {
        await rerankWithOpenAI.call(
          mockExecuteFunctions,
          `unique query ${i}`,
          [{ pageContent: `unique doc ${i}` }],
          10,
          0.0,
          0,
          false
        );
      }

      // Should not cause memory issues or crashes
      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledTimes(10);
    });
  });

  describe('Unicode and Special Character Handling', () => {
    let mockExecuteFunctions: any;

    beforeEach(() => {
      mockExecuteFunctions = createMockExecuteFunctions({
        enableCache: false,
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });
    });

    test('should handle unicode characters in queries and documents', async () => {
      const unicodeQuery = '这是中文查询 🚀 émojis and spécial châractérs';
      const unicodeDocs = [
        { pageContent: '日本語のテキスト content' },
        { text: 'العربية النص مع رموز تعبيرية 😊' },
        { content: 'Тест на русском языке 🔥' },
        { document: '特殊字符测试: @#$%^&*()[]{}|;:,.<>?' }
      ];

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
          { index: 2, relevance_score: 0.7 },
          { index: 3, relevance_score: 0.6 }
        ]
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        unicodeQuery,
        unicodeDocs,
        10,
        0.0,
        0,
        false
      );

      expect(result).toBeDefined();
      expect(result).toHaveLength(4);

      // Verify unicode content is preserved
      expect(result[0].pageContent).toBe('日本語のテキスト content');
      expect(result[1].text).toBe('العربية النص مع رموز تعبيرية 😊');
    });

    test('should handle very long queries and document content', async () => {
      const veryLongQuery = 'A'.repeat(10000); // 10KB query
      const veryLongDoc = {
        pageContent: 'B'.repeat(100000) // 100KB document
      };

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [{ index: 0, relevance_score: 0.8 }]
      });

      const result = await rerankWithOpenAI.call(
        mockExecuteFunctions,
        veryLongQuery,
        [veryLongDoc],
        10,
        0.0,
        0,
        false
      );

      expect(result).toBeDefined();
      expect(result[0].pageContent).toHaveLength(100000);
    });
  });
});