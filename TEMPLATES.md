# Custom Templates Guide

This guide explains how to use custom templates with special reranker models that require specific prompt formatting.

## When to Use Custom Templates

**Most reranker models DON'T need custom templates.** Standard models work out-of-the-box:
- `BAAI/bge-reranker-v2-m3`
- `BAAI/bge-reranker-large`
- `jina-reranker-v2-base-multilingual`
- Cohere rerankers

**Only enable custom templates if:**
- Your model documentation specifically requires prompt formatting
- You're using Qwen3 Reranker or similar chat-based rerankers
- Your endpoint expects specially formatted text

## Template Presets

### Qwen3 Reranker (Preset)

The Qwen3 preset is pre-configured for Qwen3 reranker models. It handles the complex chat format automatically.

**Important:** Qwen3 Reranker requires special vLLM server configuration:

```bash
vllm serve Qwen/Qwen3-Reranker-4B \
  --host 0.0.0.0 \
  --port 7997 \
  --task score \
  --override-pooler-config '{"architectures": ["Qwen3ForSequenceClassification"], "classifier_from_token": ["no", "yes"], "is_original_qwen3_reranker": true}'
```

**Configuration:**
- **Endpoint**: `http://localhost:7997/v1/rerank` 
- **Model**: `Qwen/Qwen3-Reranker-4B` (or other Qwen3 reranker variant)
- **Template Preset**: `Qwen3 Reranker`
- **Instruction**: Customize or use default

**Query Format:**
```
<|im_start|>system
Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>
<|im_start|>user
<Instruct>: {your instruction}
<Query>: {your query}
```

**Document Format:**
```
<Document>: {document text}<|im_end|>
<|im_start|>assistant
<think>

</think>

```

### Custom Templates

Custom templates give you full control over text formatting. The node simply wraps your content with the prefix/suffix you specify.

**How it works:**
- Query: `prefix + query + suffix`
- Documents: `prefix + document + suffix`

**No automatic tags or formatting** - you control everything.

## Custom Template Examples

### Example 1: Simple Wrapper Tags

For models that expect basic tag wrapping:

```
Query Prefix: [INST]
Query Suffix:  [/INST]
Document Prefix: [DOC]
Document Suffix:  [/DOC]
```

**Result:**
- Query: `[INST] What is machine learning? [/INST]`
- Document: `[DOC] Machine learning is a subset of AI [/DOC]`

### Example 2: Multiline Format

For models that need structured sections:

```
Query Prefix: ### Question:\n
Query Suffix: \n\n
Document Prefix: ### Context:\n
Document Suffix: \n---\n
```

**Result:**
```
### Question:
What is machine learning?

```

```
### Context:
Machine learning is a subset of AI
---
```

### Example 3: No Formatting

To send raw text without any wrapping:

```
Query Prefix: (empty)
Query Suffix: (empty)
Document Prefix: (empty)
Document Suffix: (empty)
```

**Result:**
- Query: `What is machine learning?`
- Document: `Machine learning is a subset of AI`

### Example 4: Complex Chat Format

For other chat-based models:

```
Query Prefix: <s>[INST] <<SYS>>\nYou are a relevance scorer.\n<</SYS>>\n\nQuery:
Query Suffix:  [/INST]
Document Prefix: Document:
Document Suffix:  </s>
```

## Endpoint Requirements

All templates use the **standard `/v1/rerank` endpoint**:

| Template Type | Endpoint | How it Works |
|---------------|----------|--------------|
| Standard (no templates) | `/v1/rerank` | Raw query and documents |
| Qwen3 Preset | `/v1/rerank` | Templated query and documents |
| Custom | `/v1/rerank` | Your custom formatted text |

**Request format (same for all):**
```json
{
  "model": "model-name",
  "query": "query text",
  "documents": ["doc1", "doc2"],
  "top_n": 5
}
```

Templates simply wrap your text before sending - they don't change the API format.

## Troubleshooting

### Empty Results

If you get no reranked documents:
1. Check that your endpoint is correct (`/v1/rerank`)
2. Verify the server is running with proper configuration
3. Test the endpoint directly with curl

### Bad Request (400)

Common causes:
- Server not configured properly (Qwen requires `--task score` parameter)
- Incorrect template format for the model
- Model doesn't support the rerank API

### Model Not Responding

- Verify server is running with correct parameters
- Check that model supports the rerank/score API
- Test with a simple curl request first

## Best Practices

1. **Start simple**: Try without templates first
2. **Check model docs**: Look for required prompt format in the model's HuggingFace page
3. **Test incrementally**: Start with just prefixes, add suffixes if needed
4. **Use debug mode**: Enable n8n debug logging to see formatted prompts
5. **Document your setup**: Save your working template configuration for reuse

## Additional Resources

- [vLLM Score API Documentation](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html#score-api-for-cross-encoder-models)
- [Qwen3 Reranker on HuggingFace](https://huggingface.co/Qwen/Qwen3-Reranker-4B)
- [OpenAI-Compatible Rerank Format](https://github.com/mixedbread-ai/mixedbread-rerank-api)
