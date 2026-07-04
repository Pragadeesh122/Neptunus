import config


def test_embedding_defaults():
    assert config.EMBEDDING_MODEL == "openai/text-embedding-3-large"
    assert config.EMBEDDING_DIM == 3072
    assert isinstance(config.EMBEDDING_DIM, int)


def test_pinecone_defaults():
    assert config.PINECONE_INDEX_NAME == "neptunus-rules"
    assert config.PINECONE_CLOUD == "aws"
    assert config.PINECONE_REGION == "us-east-1"
    assert hasattr(config, "PINECONE_API_KEY")
