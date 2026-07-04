"""Pinecone vector store: create-if-missing index, upsert, query."""
import time

import config


def sanitize_metadata(meta):
    """Coerce to Pinecone-allowed types (str/number/bool/list-of-str); drop None."""
    clean = {}
    for key, value in meta.items():
        if value is None:
            continue
        if isinstance(value, bool) or isinstance(value, (int, float, str)):
            clean[key] = value
        elif isinstance(value, list):
            clean[key] = [str(x) for x in value if x is not None]
        else:
            clean[key] = str(value)
    return clean


def upsert_chunks(index, items, batch_size=100):
    count = 0
    for start in range(0, len(items), batch_size):
        batch = items[start:start + batch_size]
        vectors = [
            {"id": it["id"], "values": it["values"],
             "metadata": sanitize_metadata(it["metadata"])}
            for it in batch
        ]
        index.upsert(vectors=vectors)
        count += len(vectors)
    return count


def get_index():
    from pinecone import Pinecone, ServerlessSpec

    pc = Pinecone(api_key=config.PINECONE_API_KEY)
    if config.PINECONE_INDEX_NAME not in pc.list_indexes().names():
        pc.create_index(
            name=config.PINECONE_INDEX_NAME,
            dimension=config.EMBEDDING_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud=config.PINECONE_CLOUD, region=config.PINECONE_REGION),
        )
        while not pc.describe_index(config.PINECONE_INDEX_NAME).status["ready"]:
            time.sleep(1)
    return pc.Index(config.PINECONE_INDEX_NAME)


def query(index, vector, top_k=5, filter=None):
    return index.query(
        vector=vector, top_k=top_k, include_metadata=True, filter=filter
    )
