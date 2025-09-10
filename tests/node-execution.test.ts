/**
 * Node execution integration tests
 * Tests the full node execution flow including parameter handling and data processing
 */

import { UniversalRerankerFlow } from '../nodes/UniversalRerankerFlow/UniversalRerankerFlow.node';
import { 
  createMockExecuteFunctions, 
  mockDocuments, 
  mockQuery, 
  mockOpenAIResponse, 
  mockCohereResponse 
} from './helpers/mock-helpers';
import { NodeOperationError } from 'n8n-workflow';

describe('UniversalRerankerFlow Node Execution', () => {
  let node: UniversalRerankerFlow;
  let mockExecuteFunctions: any;

  beforeEach(() => {
    node = new UniversalRerankerFlow();
    jest.clearAllMocks();
  });

  describe('Node Configuration', () => {
    test('should have correct node description properties', () => {
      expect(node.description.displayName).toBe('Universal Reranker (flow)');
      expect(node.description.name).toBe('universalRerankerFlow');
      expect(node.description.group).toContain('transform');
      expect(node.description.version).toBe(1);
    });

    test('should have all required properties defined', () => {
      const propertyNames = node.description.properties.map(p => p.name);
      
      expect(propertyNames).toContain('query');
      expect(propertyNames).toContain('documentsField');
      expect(propertyNames).toContain('service');
      expect(propertyNames).toContain('topK');
      expect(propertyNames).toContain('threshold');
      expect(propertyNames).toContain('enableCache');
      expect(propertyNames).toContain('cacheTtl');
    });

    test('should have correct credential configuration', () => {
      const cohereCredential = node.description.credentials?.find(c => c.name === 'cohereApi');
      
      expect(cohereCredential).toBeDefined();
      expect(cohereCredential?.required).toBe(false);
      expect(cohereCredential?.displayOptions?.show?.service).toContain('cohere');
    });
  });

  describe('Successful Execution Flows', () => {
    test('should execute successfully with OpenAI-compatible service', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 5,
        threshold: 0.5,
        enableCache: false,
        includeOriginalScores: false
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result).toHaveLength(1); // One output array
      expect(result[0]).toHaveLength(1); // One item in output
      
      const outputItem = result[0][0];
      expect(outputItem.json).toHaveProperty('rerankedDocs');
      expect(outputItem.json).toHaveProperty('originalCount', mockDocuments.length);
      expect(outputItem.json).toHaveProperty('rerankedCount');
      expect(outputItem.json).toHaveProperty('query', mockQuery);
      
      // Verify reranked docs structure
      expect(Array.isArray(outputItem.json.rerankedDocs)).toBe(true);
      const rerankedDocs = outputItem.json.rerankedDocs as any[];
      rerankedDocs.forEach((doc: any) => {
        expect(doc).toHaveProperty('_rerankScore');
        expect(doc).toHaveProperty('_originalIndex');
      });
    });

    test('should execute successfully with Cohere service', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'cohere',
        cohereModel: 'rerank-v3.5',
        topK: 3,
        threshold: 0.3,
        enableCache: false,
        includeOriginalScores: true
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockCohereResponse);

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0][0].json.rerankedDocs).toHaveLength(
        mockCohereResponse.results.filter(r => r.score >= 0.3).length
      );
    });

    test('should handle multiple input items', async () => {
      const multipleItems = [
        {
          json: {
            documents: mockDocuments.slice(0, 2),
            query: 'first query',
            customField: 'data1'
          }
        },
        {
          json: {
            documents: mockDocuments.slice(2, 4),
            query: 'second query',
            customField: 'data2'
          }
        }
      ];

      mockExecuteFunctions = createMockExecuteFunctions({
        query: '={{$json.query}}',
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.0,
        enableCache: false
      });

      mockExecuteFunctions.getInputData.mockReturnValue(multipleItems);
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string, index: number) => {
        const baseParams = {
          query: multipleItems[index].json.query,
          documentsField: 'documents',
          service: 'openai-compatible',
          endpoint: 'http://localhost:8000/v1/rerank',
          model: 'test-model',
          topK: 10,
          threshold: 0.0,
          enableCache: false,
          includeOriginalScores: false
        };
        return baseParams[param as keyof typeof baseParams];
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0]).toHaveLength(2); // Two output items
      expect(result[0][0].json.query).toBe('first query');
      expect(result[0][1].json.query).toBe('second query');
      expect(result[0][0].json.customField).toBe('data1');
      expect(result[0][1].json.customField).toBe('data2');
    });

    test('should handle empty document arrays', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible',
        topK: 10,
        threshold: 0.0
      });

      mockExecuteFunctions.getInputData.mockReturnValue([
        { json: { documents: [] } }
      ]);

      const result = await node.execute.call(mockExecuteFunctions);

      const outputItem = result[0][0];
      expect(outputItem.json.rerankedDocs).toEqual([]);
      expect(outputItem.json.originalCount).toBe(0);
      expect(outputItem.json.rerankedCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for empty query', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: '', // Empty query
        documentsField: 'documents',
        service: 'openai-compatible'
      });

      await expect(node.execute.call(mockExecuteFunctions))
        .rejects.toThrow(NodeOperationError);
    });

    test('should throw error for whitespace-only query', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: '   ', // Whitespace only
        documentsField: 'documents',
        service: 'openai-compatible'
      });

      await expect(node.execute.call(mockExecuteFunctions))
        .rejects.toThrow(NodeOperationError);
    });

    test('should throw error when documents field is missing', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'missingField',
        service: 'openai-compatible'
      });

      mockExecuteFunctions.getInputData.mockReturnValue([
        { json: { otherField: 'data' } }
      ]);

      await expect(node.execute.call(mockExecuteFunctions))
        .rejects.toThrow(NodeOperationError);
    });

    test('should throw error when documents field is not an array', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible'
      });

      mockExecuteFunctions.getInputData.mockReturnValue([
        { json: { documents: 'not an array' } }
      ]);

      await expect(node.execute.call(mockExecuteFunctions))
        .rejects.toThrow(NodeOperationError);
    });

    test('should throw error for unsupported service', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'unsupported-service'
      });

      await expect(node.execute.call(mockExecuteFunctions))
        .rejects.toThrow(NodeOperationError);
    });

    test('should handle and wrap API errors properly', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });

      const apiError = new Error('API connection failed');
      mockExecuteFunctions.helpers.httpRequest.mockRejectedValue(apiError);

      await expect(node.execute.call(mockExecuteFunctions))
        .rejects.toThrow(NodeOperationError);
    });
  });

  describe('Data Processing and Transformation', () => {
    test('should preserve input data structure in output', async () => {
      const inputData = {
        documents: mockDocuments,
        originalField: 'preserved',
        nestedData: {
          value: 123,
          array: [1, 2, 3]
        }
      };

      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 5,
        threshold: 0.0
      });

      mockExecuteFunctions.getInputData.mockReturnValue([{ json: inputData }]);
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await node.execute.call(mockExecuteFunctions);
      const outputItem = result[0][0];

      expect(outputItem.json.originalField).toBe('preserved');
      expect(outputItem.json.nestedData).toEqual({ value: 123, array: [1, 2, 3] });
    });

    test('should apply threshold filtering correctly', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.8 // High threshold
      });

      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await node.execute.call(mockExecuteFunctions);
      const rerankedDocs = result[0][0].json.rerankedDocs;

      // Only documents with score >= 0.8 should be included
      const rerankedDocsArray = rerankedDocs as any[];
      rerankedDocsArray.forEach((doc: any) => {
        expect(doc._rerankScore).toBeGreaterThanOrEqual(0.8);
      });
    });

    test('should respect topK parameter', async () => {
      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 2, // Limit to 2 results
        threshold: 0.0
      });

      // Mock response with only 2 results to test topK limit
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue({
        results: [
          { index: 1, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.65 }
        ]
      });

      const result = await node.execute.call(mockExecuteFunctions);
      const rerankedDocs = result[0][0].json.rerankedDocs as any[];

      expect(rerankedDocs.length).toBeLessThanOrEqual(2);
    });

    test('should include original scores when requested', async () => {
      const docsWithOriginalScores = mockDocuments.map((doc, index) => ({
        ...doc,
        _originalScore: 0.1 + (index * 0.1)
      }));

      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'documents',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model',
        topK: 10,
        threshold: 0.0,
        includeOriginalScores: true
      });

      mockExecuteFunctions.getInputData.mockReturnValue([
        { json: { documents: docsWithOriginalScores } }
      ]);
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await node.execute.call(mockExecuteFunctions);
      const rerankedDocs = result[0][0].json.rerankedDocs as any[];

      rerankedDocs.forEach((doc: any) => {
        expect(doc).toHaveProperty('_originalScore');
        expect(typeof doc._originalScore).toBe('number');
      });
    });
  });

  describe('Custom Document Field Names', () => {
    test('should work with custom documents field name', async () => {
      const customFieldData = {
        myCustomDocs: mockDocuments,
        otherData: 'should be preserved'
      };

      mockExecuteFunctions = createMockExecuteFunctions({
        query: mockQuery,
        documentsField: 'myCustomDocs',
        service: 'openai-compatible',
        endpoint: 'http://localhost:8000/v1/rerank',
        model: 'test-model'
      });

      mockExecuteFunctions.getInputData.mockReturnValue([{ json: customFieldData }]);
      mockExecuteFunctions.helpers.httpRequest.mockResolvedValue(mockOpenAIResponse);

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0][0].json.rerankedDocs).toBeDefined();
      expect(result[0][0].json.otherData).toBe('should be preserved');
    });
  });
});