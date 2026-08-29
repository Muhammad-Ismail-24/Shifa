# query(text, k=5) -> returns chunk strings

from qdrant_client import QdrantClient
from rag.embedder import embed_query
from config.settings import settings

COLLECTION_NAME = "shifa_knowledge"

client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
)


def retrieve(query: str, k: int = 5) -> list[str]:
    """
    Embed the query and return the top-k most relevant text chunks
    from the Qdrant knowledge base.
    """
    vector = embed_query(query)
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=vector,
        limit=k,
    )
    return [hit.payload["text"] for hit in results.points]
