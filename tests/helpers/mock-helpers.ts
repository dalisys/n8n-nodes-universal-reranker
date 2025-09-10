import { INode, INodeExecutionData } from 'n8n-workflow';

// Mock document samples for testing
export const mockDocuments = [
  {
    pageContent: 'The quick brown fox jumps over the lazy dog',
    metadata: { source: 'doc1' }
  },
  {
    text: 'Machine learning is a subset of artificial intelligence',
    metadata: { source: 'doc2' }
  },
  {
    content: 'Natural language processing enables computers to understand human language',
    metadata: { source: 'doc3' }
  },
  {
    document: 'Deep learning uses neural networks with multiple layers',
    metadata: { source: 'doc4' }
  },
  {
    // Document without standard text fields - should be stringified
    title: 'Custom Document',
    data: { value: 'This should be stringified' },
    metadata: { source: 'doc5' }
  }
];

export const mockQuery = 'artificial intelligence and machine learning';

// Mock OpenAI-compatible rerank response
export const mockOpenAIResponse = {
  results: [
    { index: 1, relevance_score: 0.95 },
    { index: 2, relevance_score: 0.87 },
    { index: 0, relevance_score: 0.65 },
    { index: 3, relevance_score: 0.42 },
    { index: 4, relevance_score: 0.15 }
  ]
};

// Mock Cohere rerank response
export const mockCohereResponse = {
  results: [
    { index: 1, score: 0.92 },
    { index: 2, score: 0.84 },
    { index: 0, score: 0.71 },
    { index: 3, score: 0.38 },
    { index: 4, score: 0.12 }
  ]
};

// Create mock IExecuteFunctions
export function createMockExecuteFunctions(nodeParameters: Record<string, any> = {}): any {
  const mockExecuteFunctions = {
    getNode: jest.fn().mockReturnValue({
      id: 'test-node',
      name: 'Test Universal Reranker',
      type: 'universalRerankerFlow',
      typeVersion: 1,
      position: [0, 0],
      parameters: nodeParameters
    } as INode),
    
    getNodeParameter: jest.fn().mockImplementation((parameterName: string, itemIndex?: number, defaultValue?: any) => {
      const value = nodeParameters[parameterName];
      return value !== undefined ? value : defaultValue;
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
    
    getInputData: jest.fn().mockReturnValue([
      {
        json: {
          documents: mockDocuments,
          query: mockQuery
        }
      }
    ] as INodeExecutionData[]),
    
    // Add other methods as needed for testing
    getWorkflow: jest.fn(),
    getWorkflowStaticData: jest.fn(),
    getRestApiUrl: jest.fn(),
    getInstanceId: jest.fn(),
    getTimezone: jest.fn(),
    getExecuteData: jest.fn(),
    prepareOutputData: jest.fn(),
    
  };

  return mockExecuteFunctions;
}

// Helper to create mock HTTP responses
export function createMockHttpResponse(data: any, status: number = 200) {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
    config: {}
  };
}

// Helper to create error responses
export function createMockHttpError(statusCode: number, message: string, responseBody?: any) {
  const error = new Error(message) as any;
  error.response = {
    statusCode,
    body: responseBody || { error: message },
    status: statusCode,
    data: responseBody || { error: message }
  };
  return error;
}