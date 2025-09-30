import {
	ISupplyDataFunctions,
	SupplyData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';
import { rerankWithOpenAI, rerankWithCohere } from '../shared/rerank.helpers';

export class UniversalRerankerProvider implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Universal Reranker Provider',
		name: 'universalRerankerProvider',
		icon: {light:'file:urerank.svg', dark:'file:urerank.dark.svg'},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["service"]}}',
		description: 'Provides universal reranking for vector stores (vLLM, LocalAI, Infinity, Cohere)',
		defaults: {
			name: 'Universal Reranker Provider',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiReranker],
		outputNames: ['Reranker'],
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
				description: 'Whether to use custom query and document templates for special models like Qwen3 Reranker. Most standard reranker models (BAAI, Jina, etc.) do not need this.',
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
				description: 'Text to add before the query. The final format will be: prefix + query + suffix.',
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
				description: 'Text to add after the query. The final format will be: prefix + query + suffix.',
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
				description: 'Text to add before each document. The final format will be: prefix + document + suffix.',
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
				description: 'Text to add after each document. The final format will be: prefix + document + suffix.',
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

	async supplyData(this: ISupplyDataFunctions, _itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for Universal Reranker Provider');
		const self = this;
		
		// Create a provider that implements the standard reranker interface
		// This will work with both vector stores and provide proper execution logging
		const provider = {
			name: 'Universal Reranker Provider',
			description: 'Provides universal reranking for vector stores using OpenAI-compatible or Cohere endpoints',
			
			// Standard rerank method used by vector stores
			rerank: async (input: { query: string; documents: any[]; topN?: number; threshold?: number }) => {
				// Add input logging to track calls
				const { index } = self.addInputData(NodeConnectionTypes.AiReranker, [
					[{ json: { query: input.query, documents: input.documents } }],
				]);
				
				const { query, documents } = input || {};
				const service = self.getNodeParameter('service', 0) as string;
				const topK = input?.topN ?? (self.getNodeParameter('topK', 0) as number);
				const threshold = input?.threshold ?? (self.getNodeParameter('threshold', 0) as number);
				const includeOriginalScores = self.getNodeParameter('includeOriginalScores', 0) as boolean;

				if (!query || !query.trim()) {
					throw new NodeOperationError(self.getNode(), 'Query cannot be empty');
				}
				
				const docs = Array.isArray(documents) ? documents : [];
				if (!docs.length) {
					return [];
				}

				// Convert input documents to our format
				const processedDocs = docs.map((doc, docIndex) => {
					if (doc && typeof doc === 'object') {
						return {
							pageContent: doc.pageContent || doc.text || doc.content || doc.document || JSON.stringify(doc),
							metadata: doc.metadata || {},
							_originalIndex: docIndex,
						};
					}
					return {
						pageContent: String(doc),
						metadata: {},
						_originalIndex: docIndex,
					};
				});

				let rerankedDocs: any[];
				
				if (service === 'cohere') {
					rerankedDocs = await rerankWithCohere.call(
						self as any,
						query,
						processedDocs,
						topK,
						threshold,
						0,
						includeOriginalScores,
					);
				} else {
					rerankedDocs = await rerankWithOpenAI.call(
						self as any,
						query,
						processedDocs,
						topK,
						threshold,
						0,
						includeOriginalScores,
					);
				}

				// Add output logging
				self.addOutputData(NodeConnectionTypes.AiReranker, index, [
					[{ json: { response: rerankedDocs } }],
				]);

				return rerankedDocs;
			},

			// LangChain BaseDocumentCompressor interface for backward compatibility
			compressDocuments: async (documents: any[], query: string, topN?: number) => {
				const ranked = await provider.rerank({
					query,
					documents,
					topN,
					threshold: self.getNodeParameter('threshold', 0) as number,
				});
				
				// Return documents without helper fields for LangChain compatibility
				return ranked.map((doc: any) => {
					const { _rerankScore, _originalIndex, ...cleanDoc } = doc;
					return cleanDoc;
				});
			},
		};

		return { response: provider };
	}
}
