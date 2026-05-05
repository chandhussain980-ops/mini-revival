/**
 * AI Routes
 * Handles communication with Ollama (llama3.2) for expense parsing
 * Uses few-shot prompting to extract structured data from natural language
 */
const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// All AI routes require authentication
router.use(requireAuth);

// Few-shot prompt template for expense parsing
const buildPrompt = (userInput) => `You are an expense parser. Extract structured data from user input.
Your response must be ONLY valid JSON, nothing else. No explanation, no markdown, just JSON.

Examples:
Input: "Spent 200 on food"
Output: {"amount": 200, "category": "Food"}

Input: "Paid 500 rupees for travel"
Output: {"amount": 500, "category": "Travel"}

Input: "Bought groceries for 300"
Output: {"amount": 300, "category": "Groceries"}

Input: "Had coffee for 150"
Output: {"amount": 150, "category": "Food"}

Input: "Electricity bill 2000"
Output: {"amount": 2000, "category": "Utilities"}

Input: "Movie tickets 400"
Output: {"amount": 400, "category": "Entertainment"}

Input: "Rent payment 15000"
Output: {"amount": 15000, "category": "Rent"}

Input: "Doctor visit 800"
Output: {"amount": 800, "category": "Healthcare"}

Now process:
Input: "${userInput}"
Output:`;

/**
 * POST /api/ai/parse
 * Send text to Ollama for structured extraction
 * Accepts: { text: "spent 200 on food" }
 * Returns: { amount: 200, category: "Food" }
 */
router.post('/parse', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text input is required' });
    }

    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2';

    console.log(`🤖 Parsing with ${model}: "${text}"`);

    // Call Ollama API
    const response = await axios.post(
      `${ollamaUrl}/api/generate`,
      {
        model: model,
        prompt: buildPrompt(text.trim()),
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent, structured output
          num_predict: 100, // We only need a short JSON response
        },
      },
      {
        timeout: 30000, // 30 second timeout
      }
    );

    const rawOutput = response.data.response.trim();
    console.log(`📤 Ollama raw output: ${rawOutput}`);

    // Try to extract JSON from the response
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(rawOutput);
    } catch {
      // Try to find JSON in the response (Ollama sometimes adds extra text)
      const jsonMatch = rawOutput.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    }

    // Validate the parsed output
    if (!parsed.amount || typeof parsed.amount !== 'number' || parsed.amount <= 0) {
      return res.status(422).json({
        error: 'Could not extract a valid amount from the input',
        rawInput: text,
        rawOutput,
      });
    }

    if (!parsed.category || typeof parsed.category !== 'string') {
      return res.status(422).json({
        error: 'Could not extract a valid category from the input',
        rawInput: text,
        rawOutput,
      });
    }

    // Capitalize category
    parsed.category = parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1);

    console.log(`✅ Parsed: amount=${parsed.amount}, category=${parsed.category}`);

    res.json({
      amount: parsed.amount,
      category: parsed.category,
      rawInput: text,
    });
  } catch (error) {
    console.error('AI parsing error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama is not running. Please start Ollama with: ollama serve',
      });
    }

    if (error.response?.status === 404) {
      return res.status(503).json({
        error: `Model "${process.env.OLLAMA_MODEL || 'llama3.2'}" not found. Pull it with: ollama pull llama3.2`,
      });
    }

    res.status(500).json({
      error: 'Failed to parse expense. Please try again or enter manually.',
      details: error.message,
    });
  }
});

module.exports = router;
