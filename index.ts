import type { INodeType } from 'n8n-workflow';
import type { ICredentialType } from 'n8n-workflow';

import { UniversalRerankerProvider } from './nodes/UniversalRerankerProvider/UniversalRerankerProvider.node';
import { UniversalRerankerFlow } from './nodes/UniversalRerankerFlow/UniversalRerankerFlow.node';
import { CohereRerankerApi } from './credentials/CohereRerankerApi.credentials';

export const nodes: INodeType[] = [
	new UniversalRerankerProvider(),
	new UniversalRerankerFlow(),
];
export const credentials: ICredentialType[] = [new CohereRerankerApi()];

