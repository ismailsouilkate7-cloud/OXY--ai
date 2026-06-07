# Quick Start: PDF Processing Test

## Prerequisites
✅ pdf-parse installed (`npm install pdf-parse` - already done)
✅ server.js has no syntax errors
⏳ Server needs to be started

## Test Steps

### 1. Start the Server
```bash
npm run dev
```

Wait for the server to start. You should see:
```
🚀 OXY AI Server running on http://localhost:3000
```

### 2. Upload a PDF
1. Open http://localhost:3000/chat in your browser
2. Click the "Attach files" button (📎 icon)
3. Select a PDF file from your computer
   - **Best for testing**: A simple PDF with text (Word document, PDF from text editor, etc.)
4. Wait for the file to upload (you'll see upload progress)

### 3. Send a Message
Type any message, such as:
```
kherejli hadchi
```
Or ask a specific question about the PDF:
```
What is the main topic of this document?
```

Click Send

### 4. Monitor Server Logs

**Look for these log lines (in order):**

#### Step 1: File Received
```
[Chat] Starting file processing: raw files=1, processed files=0
[Chat] Processing raw files from FormData
```

#### Step 2: PDF Detection & Extraction
```
[PDF] Processing PDF file: document.pdf
[PDF] Extracting text from PDF (size: 45232 bytes)
[PDF] ✓ Successfully extracted text from 5 page(s)
[PDF] ✓ Successfully attached PDF text to request: document.pdf
```

#### Step 3: Message Construction
```
[Chat] Final userParts structure: [
  {
    "type": "text",
    "textLength": 8523
  }
]
[Chat] Final request to API will include 1 parts
```

#### Step 4: API Request
```
[AI] 📋 API Request Structure:
  - Model: gemini-2.5-flash
  - System Instruction: You are OXY...
  - Temperature: 0.7
  - Last Message Parts: 1 parts
    [0] text: 📄 Content of PDF "document.pdf":
```

### 5. Verify AI Response

**✅ CORRECT RESPONSE:**
- AI responds with context from the PDF
- References specific content from the document
- Answers the question based on PDF content

**❌ WRONG RESPONSE (indicates problem):**
- Generic greeting like "Hello! How can I help?"
- No mention of PDF content
- Ignores the uploaded file

---

## Example Test Case

### Input
**PDF**: A simple text document with content like:
```
This is a test document.

It contains information about PDF processing.

The system should extract this text and send it to the AI.
```

**Message**: "What topics are mentioned in this document?"

### Expected Output
```
Based on the document, the following topics are mentioned:
1. PDF processing
2. Text extraction
3. Document analysis

The document describes...
```

---

## Troubleshooting

### Issue: No logs appear
**Solution:**
1. Check if server is actually running
2. Make sure you're accessing http://localhost:3000/chat
3. Check browser console for errors (F12 → Console tab)

### Issue: "Error extracting PDF text"
**Possible causes:**
- PDF is corrupted
- PDF is image-only (no selectable text)
- File is too large (try a smaller PDF)

**Solution:**
- Try a different PDF file
- Test with a simple text-based PDF

### Issue: Logs show "PDF uploaded but contains no extractable text"
**Cause:** 
- PDF is image-only or scanned document
- No OCR processing (intentional design decision)

**Expected behavior:**
- AI still receives the message
- AI acknowledges PDF is empty
- This is correct behavior

### Issue: Server crashes when uploading PDF
**Solution:**
1. Verify pdf-parse is installed:
   ```bash
   npm ls pdf-parse
   ```
2. Reinstall if needed:
   ```bash
   npm install pdf-parse
   ```
3. Restart server

---

## Performance Expectations

- **Small PDF (< 100 KB)**: ~300ms extraction time
- **Medium PDF (1 MB)**: ~1-2 seconds
- **Large PDF (10 MB)**: ~5-10 seconds
- **Huge PDF (100 MB)**: ~30+ seconds

The AI response time depends on extraction time + AI API response time (usually 2-5 seconds).

---

## Success Checklist

After testing, verify:
- ✅ Server logs show PDF detection
- ✅ Logs show text extraction from correct number of pages
- ✅ Logs show text was attached to request
- ✅ AI response mentions PDF content
- ✅ No server errors in console
- ✅ Browser shows response without errors

---

## Next: Verify Image Processing Still Works

After PDF testing, also verify images still work:
1. Upload an image
2. Ask the AI to describe it
3. Verify AI responds with image analysis

Both image and PDF processing should work together.

---

## Getting Help

If something doesn't work:

1. Check server logs (where npm run dev output appears)
2. Look for error messages starting with [PDF] or [Chat]
3. Check browser console (F12 → Console)
4. Verify server is running (should see startup message)

Most common issues are logged with detailed error messages.
