# Book Cover Scanner

Snap or upload a photo of any book cover — the app identifies it using Claude's vision and fetches results from Open Library, linking you to Amazon, Google Books, Goodreads, and more.

## Quick start

```bash
cd book-cover-scanner
pip install -r requirements.txt
export ANTHROPIC_API_KEY=your_key_here
python app.py
```

Then open http://localhost:5000 in your browser.

## How it works

1. You upload or capture a photo of a book cover
2. The image is sent to Claude (vision) which extracts the title and author
3. Open Library is queried for book metadata and cover art
4. Results show store links: Amazon, Google Books, Goodreads, and Open Library
