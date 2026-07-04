from ingestion.splitter import split_text


def test_short_text_single_chunk():
    assert split_text("hello world") == ["hello world"]


def test_char_level_size_and_overlap():
    # 5000 chars, char-level splitting → deterministic sizes + overlap
    text = "".join(str(i % 10) for i in range(5000))
    chunks = split_text(text, chunk_size=3000, overlap=500, separators=[""])
    assert len(chunks) == 2
    assert len(chunks[0]) == 3000
    assert all(len(c) <= 3000 for c in chunks)
    # 500-char overlap: tail of chunk 0 == head of chunk 1
    assert chunks[0][-500:] == chunks[1][:500]


def test_large_paragraphs_split_on_double_newline():
    p1 = "x" * 2000
    p2 = "y" * 2000
    chunks = split_text(p1 + "\n\n" + p2, chunk_size=3000, overlap=0)
    assert chunks == [p1, p2]


def test_small_paragraphs_merge_into_one_chunk():
    chunks = split_text("para one." + "\n\n" + "para two.", chunk_size=3000, overlap=0)
    assert chunks == ["para one.\n\npara two."]
