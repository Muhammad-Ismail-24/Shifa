# Run once locally → populates Qdrant Cloud

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from rag.embedder import embed
from config.settings import settings
from pathlib import Path
import uuid

COLLECTION_NAME = "shifa_knowledge"
CHUNK_SIZE = 500       # target maximum character count per chunk


def chunk_text(text: str) -> list[str]:
    """
    Split text into paragraph-aware chunks of up to ~CHUNK_SIZE characters.

    Instead of hard-slicing at a fixed character offset (which can cut
    mid-sentence), this function:
      1. Splits the document on blank-line paragraph boundaries (\\n\\n).
      2. Accumulates whole paragraphs into a chunk until adding another
         would exceed CHUNK_SIZE.
      3. Starts a new chunk with the next paragraph.

    A single paragraph longer than CHUNK_SIZE is kept intact — it is
    better to have one oversized chunk than to break a sentence.
    """
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # +2 accounts for the "\n\n" separator we'll re-join with
        added_len = len(para) + (2 if current else 0)

        if current and (current_len + added_len) > CHUNK_SIZE:
            # Flush the accumulated paragraphs as one chunk
            chunks.append("\n\n".join(current))
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += added_len

    # Flush any remaining content
    if current:
        chunks.append("\n\n".join(current))

    return chunks


def read_pdf(path: Path) -> str:
    """Extract text from a PDF file using pypdf."""
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)


def ingest_all() -> None:
    """Read all knowledge documents, chunk, embed, and upload to Qdrant Cloud."""
    client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY,
    )

    # Recreate collection (idempotent — safe to re-run)
    client.recreate_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=768, distance=Distance.COSINE),
    )

    knowledge_dir = Path(__file__).resolve().parent.parent / "data" / "knowledge"

    # --- Ingest .txt files ---
    for txt_file in knowledge_dir.glob("*.txt"):
        text = txt_file.read_text(encoding="utf-8")
        chunks = chunk_text(text)
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=embed(chunk),
                payload={"text": chunk, "source": txt_file.name},
            )
            for chunk in chunks
        ]
        client.upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"Ingested {txt_file.name} -- {len(chunks)} chunks")

    # --- Ingest .pdf files from who/ subdirectory ---
    who_dir = knowledge_dir / "who"
    if who_dir.exists():
        for pdf_file in who_dir.glob("*.pdf"):
            text = read_pdf(pdf_file)
            if not text.strip():
                print(f"Skipped {pdf_file.name} -- empty after extraction")
                continue
            chunks = chunk_text(text)
            points = [
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=embed(chunk),
                    payload={"text": chunk, "source": pdf_file.name},
                )
                for chunk in chunks
            ]
            client.upsert(collection_name=COLLECTION_NAME, points=points)
            print(f"Ingested {pdf_file.name} -- {len(chunks)} chunks")

    print("\nIngestion complete.")


if __name__ == "__main__":
    ingest_all()
