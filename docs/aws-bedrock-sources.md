# AWS Bedrock implementation sources

The Bedrock adapter is based on the official AWS Converse API and SigV4 documentation:

1. [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html) — unified message inference endpoint used by the adapter.
2. [Amazon Bedrock conversation inference guide](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) — message and inference configuration concepts.
3. [AWS Signature Version 4](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html) — request-signing protocol used for runtime calls and foundation-model discovery.
4. [AWS Bedrock Runtime JavaScript SDK reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/) — official runtime API reference.
5. [AWS Bedrock JavaScript examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html) — official SDK usage examples.

The repository implementation uses native Node.js crypto and fetch instead of adding a large SDK dependency, while retaining the official SigV4 and API boundaries. Real AWS calls remain credential-dependent and must be validated by the operator with authorized AWS credentials and model access enabled in the selected region.
