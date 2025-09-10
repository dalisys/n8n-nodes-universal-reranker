import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
    NodeConnectionTypes,
} from 'n8n-workflow';
import { rerankWithOpenAI, rerankWithCohere } from '../shared/rerank.helpers';

export class UniversalRerankerFlow implements INodeType {
		description: INodeTypeDescription = {
			displayName: 'Universal Reranker (flow)',
			name: 'universalRerankerFlow',
			icon: {light:'file:urerank.svg', dark:'file:urerank.dark.svg'},
			group: ['transform'],
			version: 1,
			subtitle: '={{$parameter["service"]}}',
			description: 'Rerank documents in workflow using various services (vLLM, LocalAI, Infinity, Cohere)',
			defaults: {
				name: 'Universal Reranker',
			},
			inputs: [NodeConnectionTypes.Main],
			outputs: [NodeConnectionTypes.Main],
			outputNames: ['Main'],
			credentials: [
				{
					name: 'cohereApi',
					required: false,
					displayOptions: {
						show: {
							service: ['cohere'],
						},
					},
				},
			],
			properties: [
				{
					displayName: 'Query',
					name: 'query',
					type: 'string',
					default: '',
					required: true,
					description: 'The search query to rerank documents against',
				},
				{
					displayName: 'Documents Field',
					name: 'documentsField',
					type: 'string',
					default: 'documents',
					required: true,
					description: 'The field containing the array of documents to rerank',
				},
				{
					displayName: 'Service',
					name: 'service',
					type: 'options',
					options: [
						{
							name: 'OpenAI-Compatible',
							value: 'openai-compatible',
							description: 'Compatible with vLLM, LocalAI, Infinity, and other OpenAI-compatible endpoints',
						},
						{
							name: 'Cohere',
							value: 'cohere',
							description: 'Use Cohere rerank API',
						},
					],
					default: 'openai-compatible',
					description: 'The reranking service to use',
				},
				{
					displayName: 'Endpoint',
					name: 'endpoint',
					type: 'string',
					default: 'http://localhost:8000/v1/rerank',
					description: 'The reranking endpoint URL',
					displayOptions: {
						show: {
							service: ['openai-compatible'],
						},
					},
				},
				{
					displayName: 'Model',
					name: 'model',
					type: 'string',
					default: 'BAAI/bge-reranker-v2-m3',
					description: 'The model to use for reranking',
					displayOptions: {
						show: {
							service: ['openai-compatible'],
						},
					},
				},
				{
					displayName: 'Model',
					name: 'cohereModel',
					type: 'options',
					options: [
						{
							name: 'rerank-v3.5',
							value: 'rerank-v3.5',
						},
						{
							name: 'rerank-english-v3.0',
							value: 'rerank-english-v3.0',
						},
						{
							name: 'rerank-multilingual-v3.0',
							value: 'rerank-multilingual-v3.0',
						},
						{
							name: 'Custom',
							value: 'custom',
						},
					],
					default: 'rerank-v3.5',
					description: 'The Cohere model to use for reranking',
					displayOptions: {
						show: {
							service: ['cohere'],
						},
					},
				},
				{
					displayName: 'Custom Model Name',
					name: 'cohereCustomModel',
					type: 'string',
					default: '',
					placeholder: 'Enter custom Cohere model name',
					description: 'Custom Cohere model name to use for reranking',
					displayOptions: {
						show: {
							service: ['cohere'],
							cohereModel: ['custom'],
						},
					},
				},
				{
					displayName: 'Top K',
					name: 'topK',
					type: 'number',
					default: 10,
					description: 'Maximum number of documents to return',
				},
				{
					displayName: 'Threshold',
					name: 'threshold',
					type: 'number',
					default: 0.000,
					description: 'Minimum relevance score threshold (0-1)',
					typeOptions: {
						minValue: 0,
						maxValue: 1,
						numberPrecision: 3,
						numberStepSize: 0.001,
					},
				},
				{
					displayName: 'Include Original Scores',
					name: 'includeOriginalScores',
					type: 'boolean',
					default: false,
					description: 'Whether to include original document scores in the output',
				},
				{
					displayName: 'Enable Caching',
					name: 'enableCache',
					type: 'boolean',
					default: false,
					description: 'Whether to cache reranking results to improve performance for repeated queries',
				},
				{
					displayName: 'Cache TTL (Minutes)',
					name: 'cacheTtl',
					type: 'number',
					default: 5,
					description: 'Time to live for cached results in minutes',
					typeOptions: {
						minValue: 1,
						maxValue: 60,
					},
					displayOptions: {
						show: {
							enableCache: [true],
						},
					},
				},
			],
		};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const service = this.getNodeParameter('service', i) as string;
				const query = this.getNodeParameter('query', i) as string;
				const docsField = this.getNodeParameter('documentsField', i) as string;
				const topK = this.getNodeParameter('topK', i) as number;
				const threshold = this.getNodeParameter('threshold', i) as number;
				const includeOriginalScores = this.getNodeParameter('includeOriginalScores', i) as boolean;

				if (!query || query.trim() === '') {
					throw new NodeOperationError(this.getNode(), 'Query cannot be empty', { itemIndex: i });
				}

				const docs = items[i].json[docsField] as any[];

				if (!docs || !Array.isArray(docs)) {
					throw new NodeOperationError(
						this.getNode(),
						`No documents found in field: ${docsField}. Expected an array of documents.`,
						{ itemIndex: i }
					);
				}

				if (docs.length === 0) {
					// Return empty result if no documents
					returnData.push({
						json: {
							...items[i].json,
							rerankedDocs: [],
							originalCount: 0,
							rerankedCount: 0,
							query: query,
						},
					});
					continue;
				}

				let rerankedDocs: any[];

				switch (service) {
					case 'openai-compatible':
						rerankedDocs = await rerankWithOpenAI.call(
							this,
							query,
							docs,
							topK,
							threshold,
							i,
							includeOriginalScores,
						);
						break;
					case 'cohere':
						rerankedDocs = await rerankWithCohere.call(
							this,
							query,
							docs,
							topK,
							threshold,
							i,
							includeOriginalScores,
						);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Unsupported service: ${service}`, { itemIndex: i });
				}

				returnData.push({
					json: {
						...items[i].json,
						rerankedDocs,
						originalCount: docs.length,
						rerankedCount: rerankedDocs.length,
						query: query,
					},
				});

			} catch (error) {
				if (error instanceof NodeOperationError) {
					throw error;
				}
				const err = error as Error;
				throw new NodeOperationError(this.getNode(), `Reranking failed: ${err.message}`, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
