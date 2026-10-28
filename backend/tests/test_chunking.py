from services.chunking import chunk_text


def test_short_text_is_one_chunk():
    assert chunk_text("Hello world.") == ["Hello world."]


def test_empty_and_whitespace_give_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("  \n\n \t \n") == []


def test_short_paragraphs_are_packed_together():
    text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
    assert chunk_text(text, max_chars=200) == ["First paragraph.\n\nSecond paragraph.\n\nThird paragraph."]


def test_chunks_never_exceed_the_limit():
    text = "\n\n".join(f"Paragraph {i}. " + "word " * 60 for i in range(20))
    chunks = chunk_text(text, max_chars=300, overlap=50)
    assert len(chunks) > 5
    assert all(0 < len(c) <= 300 for c in chunks)


def test_long_paragraph_is_split_at_sentence_ends():
    sentences = [f"This is sentence number {i} of the long paragraph." for i in range(30)]
    chunks = chunk_text(" ".join(sentences), max_chars=200, overlap=0)
    assert all(len(c) <= 200 for c in chunks)
    assert all(c.endswith(".") for c in chunks)  # cut between sentences, never inside one


def test_text_without_any_punctuation_or_spaces_is_still_split():
    chunks = chunk_text("x" * 2500, max_chars=1000, overlap=0)
    assert [len(c) for c in chunks] == [1000, 1000, 500]


def test_neighbouring_chunks_share_overlap():
    words = " ".join(f"w{i}" for i in range(400))
    chunks = chunk_text(words, max_chars=300, overlap=60)
    for first, second in zip(chunks, chunks[1:]):
        shared_word = first.split()[-1]
        assert shared_word in second.split()[:15], "the end of one chunk should reappear at the start of the next"


def test_no_content_is_lost():
    text = "\n\n".join(f"Unique marker {i} " + "filler " * 40 for i in range(15))
    joined = " ".join(chunk_text(text, max_chars=300, overlap=40))
    assert all(f"Unique marker {i}" in joined for i in range(15))


def test_windows_line_endings_and_unicode():
    chunks = chunk_text("Café résumé naïve.\r\n\r\n日本語のテキスト。", max_chars=100)
    assert "Café" in chunks[0] and "日本語" in chunks[0]


def test_overlap_also_works_for_sentence_text():
    sentences = [f"Sentence number {i} says something useful." for i in range(40)]
    chunks = chunk_text(" ".join(sentences), max_chars=250, overlap=60)
    assert len(chunks) > 4 and all(len(c) <= 250 for c in chunks)
    for first, second in zip(chunks, chunks[1:]):
        assert first.split()[-1] in second.split()[:14]
