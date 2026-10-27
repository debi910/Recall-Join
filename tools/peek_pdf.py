import sys, pdfplumber
with pdfplumber.open(sys.argv[1]) as pdf:
    for i, page in enumerate(pdf.pages[:2]):
        print("=== page", i, "text head:\n", (page.extract_text() or "")[:600])
        for t in page.extract_tables():
            print("--- table rows", len(t))
            for r in t[:5]: print(r)
