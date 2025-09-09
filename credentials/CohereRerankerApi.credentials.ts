import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CohereRerankerApi implements ICredentialType {
	name = 'cohereRerankerApi';
	displayName = 'Cohere Reranker API';
	documentationUrl = 'https://docs.cohere.com/reference/rerank';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Cohere API key from https://dashboard.cohere.ai/',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.cohere.ai/v1',
			url: '/rerank',
			method: 'POST',
			body: {
				model: 'rerank-v3.5',
				query: 'test',
				documents: ['This is a test document'],
				top_n: 1,
			},
		},
	};
}
