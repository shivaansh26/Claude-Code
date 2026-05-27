import os
import base64
import re
import urllib.parse
import urllib.request
import json

import anthropic
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


def identify_book(image_b64: str, media_type: str) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "This is a photo of a book cover. "
                            "Extract the title and author from the cover. "
                            "Reply ONLY with valid JSON in this exact format: "
                            '{"title": "...", "author": "..."} '
                            "If you cannot identify the book, reply with "
                            '{"title": null, "author": null}.'
                        ),
                    },
                ],
            }
        ],
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


def search_open_library(title: str, author: str | None) -> list[dict]:
    query = title
    if author:
        query += f" {author}"
    encoded = urllib.parse.quote(query)
    url = f"https://openlibrary.org/search.json?q={encoded}&limit=5&fields=key,title,author_name,isbn,cover_i,first_publish_year"

    with urllib.request.urlopen(url, timeout=8) as resp:
        data = json.loads(resp.read())

    results = []
    for doc in data.get("docs", [])[:5]:
        isbn_list = doc.get("isbn", [])
        isbn = isbn_list[0] if isbn_list else None
        cover_id = doc.get("cover_i")
        cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None

        # Build store links
        title_q = urllib.parse.quote(doc.get("title", title))
        author_q = urllib.parse.quote(
            " ".join(doc.get("author_name", [author] if author else []))
        )
        amazon_q = urllib.parse.quote(
            f"{doc.get('title', title)} {' '.join(doc.get('author_name', []))}"
        )

        results.append(
            {
                "title": doc.get("title"),
                "authors": doc.get("author_name", []),
                "year": doc.get("first_publish_year"),
                "isbn": isbn,
                "cover_url": cover_url,
                "open_library_url": f"https://openlibrary.org{doc['key']}",
                "amazon_url": f"https://www.amazon.com/s?k={amazon_q}&i=stripbooks",
                "goodreads_url": f"https://www.goodreads.com/search?q={title_q}+{author_q}",
                "google_books_url": f"https://www.google.com/search?q={amazon_q}&tbm=bks",
            }
        )
    return results


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/scan", methods=["POST"])
def scan():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    allowed = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    media_type = file.content_type or "image/jpeg"
    if media_type not in allowed:
        # Guess from extension
        ext = (file.filename or "").rsplit(".", 1)[-1].lower()
        media_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                      "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/jpeg")

    raw = file.read()
    image_b64 = base64.standard_b64encode(raw).decode("utf-8")

    try:
        book = identify_book(image_b64, media_type)
    except Exception as e:
        return jsonify({"error": f"Vision API error: {e}"}), 500

    if not book.get("title"):
        return jsonify({"error": "Could not identify a book in this image. Try a clearer photo of the cover."}), 422

    try:
        results = search_open_library(book["title"], book.get("author"))
    except Exception:
        results = []

    # If Open Library found nothing, build a fallback result from Claude's extraction
    if not results:
        amazon_q = urllib.parse.quote(f"{book['title']} {book.get('author', '')}")
        results = [
            {
                "title": book["title"],
                "authors": [book["author"]] if book.get("author") else [],
                "year": None,
                "isbn": None,
                "cover_url": None,
                "open_library_url": f"https://openlibrary.org/search?q={amazon_q}",
                "amazon_url": f"https://www.amazon.com/s?k={amazon_q}&i=stripbooks",
                "goodreads_url": f"https://www.goodreads.com/search?q={amazon_q}",
                "google_books_url": f"https://www.google.com/search?q={amazon_q}&tbm=bks",
            }
        ]

    return jsonify({"identified": book, "results": results})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
