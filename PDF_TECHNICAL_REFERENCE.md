# PDF Processing - Technical Reference

## API Request Structure

### Without PDF (Current)
```json
{
  "model": "gemini-2.5-flash",
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "kherejli hadchi"
        }
      ]
    }
  ],
  "config": {
    "systemInstruction": "You are OXY AI...",
    "temperature": 0.7
  }
}
```

**Result**: AI responds with generic greeting (no context)

---

### With PDF (After Fix)
```json
{
  "model": "gemini-2.5-flash",
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "📄 Content of PDF \"document.pdf\":\n```\n--- Page 1 ---\nThis is the extracted text from page 1...\n\n--- Page 2 ---\nThis is the extracted text from page 2...\n\n--- Page 3 ---\nThis is the extracted text from page 3...\n```"
        },
        {
          "text": "kherejli hadchi"
        }
      ]
    }
  ],
  "config": {
    "systemInstruction": "You are OXY AI...",
    "temperature": 0.7
  }
}
```

**Result**: AI analyzes PDF and responds with content-aware answer

---

## How PDF Text Gets Included

### Step 1: File Reception
```javascript
// In /api/chat endpoint
const files = req.files || []; // Received from multipart/form-data
console.log(`Files received: ${files.length}`);
```

### Step 2: File Type Detection
```javascript
// In buildFileParts function
for (const file of files) {
    const { mimetype, buffer, originalname } = file;
    
    if (mimetype === 'application/pdf') {  // ← PDF detected
        // → Go to PDF extraction
    }
}
```

### Step 3: PDF Text Extraction
```javascript
// In buildFileParts for PDFs
try {
    console.log(`[PDF] Processing PDF file: ${originalname}`);
    
    // ← This is where pdf-parse extracts the text
    const extractedText = await extractPdfText(buffer);
    
    // → Text is now ready to include in message
    console.log(`[PDF] ✓ Successfully attached PDF text to request`);
    
} catch (err) {
    console.error('[PDF] ❌ Error processing PDF file:', err.message);
}
```

### Step 4: Text Formatting
```javascript
// Extracted text is formatted as markdown code block
const formattedPdfText = `
📄 Content of PDF "${originalname}":
\`\`\`
${extractedText}
\`\`\`
`;
```

### Step 5: Message Construction
```javascript
// Add PDF text to userParts
userParts.push({ text: formattedPdfText });

// Add user's message
userParts.push({ text: "kherejli hadchi" });

// Final structure
const userMessage = {
    role: "user",
    parts: userParts  // Contains both PDF and user message
};
```

### Step 6: API Request
```javascript
// Send to Google Generative AI
const reqData = {
    model: 'gemini-2.5-flash',
    contents: [...historyToUse.slice(0, -1), userMessage],
    config: { ... }
};

const response = await client.models.generateContentStream(reqData);
```

---

## extractPdfText Function Flow

```
Input: PDF file buffer
    ↓
Use pdf-parse to parse: const data = await pdfParse(buffer)
    ↓
Get metadata: pageCount = data.numpages
    ↓
Get text: pages = data.text.split(/\f/)  // Split by page breaks
    ↓
For each page:
    - Trim whitespace
    - Add page marker: "--- Page N ---"
    - Build fullText string
    ↓
Check if text is empty:
    - If empty: return "[PDF uploaded but contains no extractable text]"
    - If not empty: continue
    ↓
Limit text to 50,000 characters:
    - If fullText > 50000: truncate + log warning
    ↓
Return extracted text
```

---

## Error Handling Flow

```
Try to extract PDF:
    ↓
Success:
    → Log: "[PDF] ✓ Successfully extracted text from N page(s)"
    → Add to userParts
    → Continue
    ↓
Empty PDF:
    → Log: "[PDF] ⚠️  PDF has no extractable text content"
    → Return: "[PDF uploaded but contains no extractable text]"
    → Still add to message (AI sees empty marker)
    ↓
Error:
    → Log: "[PDF] ❌ Error extracting PDF text: {error}"
    → Return: "[Error extracting PDF text: {error}]"
    → Still add to message (AI sees error marker)
```

---

## Logging Sequence

### Normal PDF Processing
```
[Chat] Starting file processing: raw files=1, processed files=0
[Chat] Processing raw files from FormData
[PDF] Processing PDF file: myfile.pdf
[PDF] Extracting text from PDF (size: 45232 bytes)
[PDF] ✓ Successfully extracted text from 3 page(s)
[PDF] ✓ Successfully attached PDF text to request: myfile.pdf
[Chat] Final userParts structure: [{"type":"text","textLength":8523}]
[Chat] Final request to API will include 1 parts
[AI] 📋 API Request Structure:
  - Model: gemini-2.5-flash
  - Last Message Parts: 1 parts
    [0] text: 📄 Content of PDF "myfile.pdf": ```... (8523 chars)
[AI] ✅ Key[1] succeeded with model gemini-2.5-flash
```

### PDF Processing with Error
```
[Chat] Starting file processing: raw files=1, processed files=0
[Chat] Processing raw files from FormData
[PDF] Processing PDF file: corrupted.pdf
[PDF] Extracting text from PDF (size: 12345 bytes)
[PDF] ❌ Error extracting PDF text: PDF parsing failed
[PDF] ⚠️  PDF processing returned error/empty: corrupted.pdf
[PDF] ✓ Successfully attached PDF text to request: corrupted.pdf
[Chat] Final userParts structure: [{"type":"text","textLength":65}]
```

---

## Preprocessed Files Path

### Preprocessed PDF Flow
```
User uploads PDF:
    ↓
/api/preprocess-files:
    - Saves file to /uploads/
    - Returns: { fileId, name, type: "application/pdf", url, status: "ready" }
    ↓
Frontend sends to /api/chat:
    - Includes: { processedFiles: [{ name, type, url, ... }] }
    ↓
/api/chat processedFiles loop:
    - Loads file from disk: /uploads/{filename}
    - Checks type: "application/pdf"
    ↓
PDF Extraction:
    - Calls: extractPdfText(buffer)
    - Same extraction process as raw files
    ↓
Message Construction:
    - Adds text to userParts
    - Sends to API
```

---

## Code References

### extractPdfText Location
**File**: server.js, Lines 1831-1870

### buildFileParts PDF Handling
**File**: server.js, Lines 1914-1935

### /api/chat PDF Handling (Preprocessed)
**File**: server.js, Lines 2318-2332

### Main /api/chat Endpoint
**File**: server.js, Lines 2119-2360

---

## Testing with curl

### Upload PDF via curl
```bash
curl -X POST http://localhost:3000/api/chat \
  -F "message=kherejli hadchi" \
  -F "files=@document.pdf" \
  -F "sessionId=test-session" \
  -F "userName=TestUser" \
  -F "model=gemini-2.5-flash" \
  -H "Accept: text/event-stream"
```

**Expected Server Logs:**
```
[PDF] Processing PDF file: document.pdf
[PDF] Extracting text from PDF (size: ...)
[PDF] ✓ Successfully extracted text from N page(s)
```

---

## Response Streaming

When you send a request with a PDF, the response comes as Server-Sent Events (SSE):

```
data: {"text":"Based on the PDF"}
data: {"text":", I can see that"}
data: {"text":" the document discusses"}
data: {"text":" several important topics."}
...
```

The AI's response is streamed as it's being generated by the API.

---

## Token Considerations

### Text Limits
- **PDF text**: Limited to 50,000 characters
- **Message**: No limit (but recommend < 1000 chars)
- **System prompt**: ~500 characters
- **Total**: ~50,500 characters → ~12,000 tokens

### Token Count Formula
```
Approx tokens ≈ characters / 4
Example: 50,000 chars ÷ 4 = ~12,500 tokens
```

### Why 50,000 Limit?
- Prevent token overflow
- Keep within most models' context window
- Avoid excessive API costs
- Maintain reasonable response time

---

## Security Considerations

### File Handling
- Files stored in `/uploads/` (or `/tmp/uploads/` on Vercel)
- Files deleted after processing (PDFs uploaded to API)
- No persistent storage of extracted text

### Text Extraction
- Text extracted entirely on server
- User never sees raw PDF data
- Only processed/formatted text is sent to AI

### Privacy
- PDF content only sent to AI for processing
- User can delete files from upload directory
- No logging of actual PDF content (only metadata)

---

## Troubleshooting

### PDF Not Extracted
**Check:**
1. Is pdf-parse installed? `npm ls pdf-parse`
2. Does server log show `[PDF] Extracting text from PDF`?
3. Is PDF corrupted? Try different PDF

### AI Still Ignores PDF
**Check:**
1. Are extraction logs showing success?
2. Does final userParts contain text part?
3. Is API log showing text in the request?

### Slow Extraction
**Normal for:**
- PDFs > 10 MB (extraction may take 10+ seconds)
- Complex PDF layouts
- Large page counts

**Optimization:**
- Consider limiting PDF size
- Pre-process large PDFs offline

---

## Summary

The PDF processing pipeline:
1. ✅ Detects PDF MIME type
2. ✅ Extracts text using pdf-parse
3. ✅ Formats with page markers
4. ✅ Includes in message as text part
5. ✅ Sends complete request to AI
6. ✅ AI responds with PDF analysis

All with comprehensive logging and error handling.
