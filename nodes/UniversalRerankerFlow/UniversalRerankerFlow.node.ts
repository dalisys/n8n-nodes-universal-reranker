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
				{
					name: 'openAiApi',
					required: false,
					displayOptions: {
						show: {
							service: ['openai-compatible'],
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
					description: 'The reranking endpoint URL. Standard models use /v1/rerank, Qwen3 reranker requires /v1/score.',
					hint: 'Examples: http://localhost:8000/v1/rerank (standard) or http://localhost:8000/v1/score (Qwen)',
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
					displayName: 'Enable Custom Templates',
					name: 'enableCustomTemplates',
					type: 'boolean',
					default: false,
					description: 'Enable for special models like Qwen3 Reranker that require chat-format templates. Most standard reranker models (BAAI, Jina, etc.) do not need this.',
					hint: 'Only enable if your model requires specific prompt formatting',
					displayOptions: {
						show: {
							service: ['openai-compatible'],
						},
					},
				},
				{
					displayName: 'Template Preset',
					name: 'templatePreset',
					type: 'options',
					options: [
						{
							name: 'Qwen3 Reranker',
							value: 'qwen3',
							description: 'Template for Qwen3 reranker models',
						},
						{
							name: 'Custom',
							value: 'custom',
							description: 'Define custom templates',
						},
					],
					default: 'qwen3',
					description: 'Select a template preset or use custom templates',
					displayOptions: {
						show: {
							service: ['openai-compatible'],
							enableCustomTemplates: [true],
						},
					},
				},
				{
					displayName: 'Instruction',
					name: 'instruction',
					type: 'string',
					default: 'Given a web search query, retrieve relevant passages that answer the query',
					description: 'The instruction for the reranker (used in Qwen3 template)',
					hint: 'IMPORTANT: Qwen3 Reranker requires vLLM server started with: --task score --override-pooler-config \'{"architectures": ["Qwen3ForSequenceClassification"], "classifier_from_token": ["no", "yes"], "is_original_qwen3_reranker": true}\'',
					displayOptions: {
						show: {
							service: ['openai-compatible'],
							enableCustomTemplates: [true],
							templatePreset: ['qwen3'],
						},
					},
				},
				{
					displayName: 'Query Prefix',
					name: 'queryPrefix',
					type: 'string',
					default: '',
					placeholder: 'e.g., [INST] ',
					description: 'Text to add before the query. The final format will be: prefix + query + suffix',
					typeOptions: {
						rows: 3,
					},
					displayOptions: {
						show: {
							service: ['openai-compatible'],
							enableCustomTemplates: [true],
							templatePreset: ['custom'],
						},
					},
				},
				{
					displayName: 'Query Suffix',
					name: 'querySuffix',
					type: 'string',
					default: '',
					placeholder: 'e.g., [/INST]',
					description: 'Text to add after the query. The final format will be: prefix + query + suffix',
					typeOptions: {
						rows: 2,
					},
					displayOptions: {
						show: {
							service: ['openai-compatible'],
							enableCustomTemplates: [true],
							templatePreset: ['custom'],
						},
					},
				},
				{
					displayName: 'Document Prefix',
					name: 'documentPrefix',
					type: 'string',
					default: '',
					placeholder: 'e.g., [DOC] ',
					description: 'Text to add before each document. The final format will be: prefix + document + suffix',
					displayOptions: {
						show: {
							service: ['openai-compatible'],
							enableCustomTemplates: [true],
							templatePreset: ['custom'],
						},
					},
				},
				{
					displayName: 'Document Suffix',
					name: 'documentSuffix',
					type: 'string',
					default: '',
					placeholder: 'e.g., [/DOC]',
					description: 'Text to add after each document. The final format will be: prefix + document + suffix',
					typeOptions: {
						rows: 2,
					},
					displayOptions: {
						show: {
							service: ['openai-compatible'],
							enableCustomTemplates: [true],
							templatePreset: ['custom'],
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
