import express from "express"                                         // expres is web server framework. It handlesroutes, requests, responses
import dotenv from "dotenv"                                           // reads .env file and loads into process.env
import multer from "multer"                                           // middleware to handle multipart/form-data
import cors from "cors"                                               // allows frontend to call backend
import { GoogleGenAI } from "@google/genai"                           // gemini SDK wrapper. Abstracts HTTP calls to google API

dotenv.config()

const app = express()

const upload = multer({                                               // multer configuration. This creates a file upload handler
  limits: { fileSize: 6 * 1024 * 1024 },                              // max file size = 6 MB. If exceeded multer throws error before route logic
  fileFilter: (req, file, cb) => {                                    // this is the function multer runs for every file
    const isImage = file.mimetype.startsWith("image/")
    
    if (!isImage) {                                                   // checks MIME type. Ensures only images allowed
      cb(new Error("Only images allowed"))                            // reject file
    } else {
      cb(null, true)                                                    // null -> no error, true -> accept file
  }
}
})

app.use(cors())                                                       // allows cross origin requests
app.use(express.json())                                               // parses JSON body (not used here for file upload)

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY })           // creates API client. Uses env variable

app.get("/", (req, res) => { res.json({ message: "Hit root URL" }) })


app.post("/analyze-cleanliness", (req, res, next) => {                // main route
  upload.single("image")(req, res, (err) => {                         // parse multipart request. Extracts file. Stores in req.file
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {                           // file too large
        return res.status(413).json({                                 // payload too large
          error: "Image is too large. Please select a smaller photo."
        })
      }
      return res.status(400).json({ error: "Invalid image upload" })  // invalid file
    }
    next()                                                            // move to next handler
  })
  }, async (req, res) => {
    try {
        const file = req.file

        if (!file) return res.status(400).json({ error: "No image uploaded" })
        if (!file.mimetype.startsWith("image/")) return res.status(400).json({ error: "Only image files allowed" })
    
        const prompt = `
        You are an AI that analyzes an image for cleanliness.

        STEP 1: Identify scene:
        - "room" (any indoor room: office, bedroom, living room)
        - "washroom"
        - "other" (screens, UI, outdoor, unclear)

        STEP 2: Validate image:
        - blurry
        - too dark
        - too zoomed

        STEP 3:
        - If scene is "other" → valid = false
        - If image quality is poor → valid = false

        STEP 4: Cleanliness evaluation:

        IMPORTANT:
        - Base decision ONLY on visible cleanliness
        - Do NOT assume smell or hidden factors

        DECISION RULES:
        - If the place looks clean and organized → "clean"
        - If visible mess, dirt, clutter → "dirty"
        - Use "unknown" ONLY if truly unclear

        Return ONLY JSON:

        {
          "scene": "room" | "washroom" | "other",
          "valid": true | false,
          "reason": "",
          "quality": {
            "zoomed": boolean,
            "blurry": boolean,
            "dark": boolean
        },

        "cleanliness": {
            "status": "clean" | "dirty" | "unknown",
            "confidence": number,
            "issues": string[]
          }
        }
        `

        const delay = (ms) => new Promise(res => setTimeout(res, ms))
        let response

        for (let i = 0; i < 2 ; i++) {
          try {
            console.log(`Attempt ${i + 1}`)
            response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [
                prompt,
                {
                  inlineData: {
                    mimeType: file.mimetype,
                    data: file.buffer.toString("base64"),
                  }
                }
              ],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 500,
              }
            })
            break
          } catch (err) {
            console.error("AI Error:", {
              message: err.message,
              status: err.status,
              stack: err.stack
            })

            if (err.status === 429) {
              return res.status(429).json({
                error: "Daily limit reached. Try again later."
              })
            }

            if (err.status === 503) {
              if (i === 1) {
                return res.status(503).json({
                  error: "Server busy. Please try again in a few seconds."
                })
              }

              console.log("Retrying after 503...")
              await delay(1500 * (i + 1))
              continue
            }

            console.error("Unexpected AI faliure :", err)
            return res.status(500).json({
              error: "Server error. Please try again."
            })
          }
        }

        if (!response) {
          return res.status(503).json({
            error: "AI service busy, please try again"
          })
        }

        const text = response.text

        let parsed = {
          scene: "other",
          valid: false,
          reason: "Parsing failed",
          quality: {},
          cleanliness: { status: "unknown", confidence: 0, issues: [] },
        }

        try {
            let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim()
            const match = cleanText.match(/\{[\s\S]*\}/)

            if (match) {
              try {
                parsed = JSON.parse(match[0])
              } catch {
                parsed.reason = "Invalid JSON format from AI"
              }
            } else parsed.reason = "No JSON found in AI response"
        } catch (e) {
          console.log("Parsing failed:", e)
          console.log("RAW AI RESPONSE:\n", text)
        }

        parsed.valid = parsed.valid ?? true
        parsed.scene = parsed.scene || "other"
        parsed.reason = parsed.reason || ""
        parsed.cleanliness = parsed.cleanliness || {
          status: "unknown",
          confidence: 0,
          issues: [],
        }

        parsed.cleanliness.issues = Array.isArray(parsed.cleanliness.issues)
        ? parsed.cleanliness.issues
        : []

        parsed.quality = parsed.quality || {}

        const { blurry, dark, zoomed } = parsed.quality

        if (blurry || dark || zoomed) {
          parsed.valid = false
          parsed.reason = "Poor image quality"
        }

        if (parsed.scene === "other") {
          parsed.valid = false
          if (!parsed.reason) {
            parsed.reason = "Unsupported scene"
          }
        }

        if (!parsed.valid) {
          parsed.alert = "none"
          return res.json(parsed)
        }

        parsed.cleanliness.confidence = Number(parsed.cleanliness.confidence) || 0

        if (parsed.cleanliness.issues.length > 0) {
          parsed.cleanliness.status = "dirty"
        } else if (parsed.cleanliness.confidence < 0.3) {
          parsed.cleanliness.status = "unknown"
        } else {
          parsed.cleanliness.status = "clean"
        }

        let alert = "none"

        if (parsed.cleanliness.status === "dirty") {
          if (parsed.scene === "washroom") {
            alert = parsed.cleanliness.confidence > 0.75 ? "high" : "medium"
          } else if (parsed.scene === "room") {
            alert = parsed.cleanliness.confidence > 0.85 ? "high" : "low"
          }
        }

        parsed.alert = alert

        res.json(parsed)
        console.log("RESULT :", parsed)
    } catch (err) {
        console.error("SERVER ERROR:", {
          message: err.message,
          stack: err.stack
        })
        res.status(500).json({ error: "Request failed (API issue / server error)" })
    }
})


app.listen(process.env.PORT, () => {
  console.log("Server started at PORT :", process.env.PORT)
})

