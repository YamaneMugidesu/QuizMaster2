
import { GoogleGenAI, Type } from "@google/genai";
import { Question, QuestionType, Difficulty } from '../types';

// Helper to generate a unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

interface GeneratedQuestionPart extends Partial<Question> {
  text: string;
  options?: string[];
  correctAnswer: string;
  subject: string;
  difficulty: Difficulty;
}

export const generateAIQuestion = async (topic: string, type: QuestionType): Promise<GeneratedQuestionPart | null> => {
  try {
    // Initialize lazily to avoid top-level process access issues in browser
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-2.5-flash';
    
    // Adjusted prompt for Chinese content
    const prompt = `Create a single challenging ${type} quiz question about "${topic}" in Simplified Chinese (简体中文). 
    Also suggest a short Subject tag (e.g. Math, History) and a Difficulty level (EASY, MEDIUM, or HARD).`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The question text in Simplified Chinese" },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Array of 4 options in Chinese if multiple choice, else empty" 
            },
            correctAnswer: { type: Type.STRING, description: "The correct answer string in Chinese" },
            subject: { type: Type.STRING, description: "The academic subject (2-4 chars)" },
            difficulty: { type: Type.STRING, enum: ['EASY', 'MEDIUM', 'HARD'], description: "Difficulty level" }
          },
          required: ["text", "correctAnswer", "subject", "difficulty"]
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    
    if (!data.text) return null;

    let options = undefined;
    if (type === QuestionType.MULTIPLE_CHOICE) {
      options = data.options;
    } else if (type === QuestionType.TRUE_FALSE) {
      options = ['正确', '错误']; // Standardized Chinese True/False
      // Ensure the AI generated answer matches our standardized options
      if (data.correctAnswer !== '正确' && data.correctAnswer !== '错误') {
         // Fallback logic if AI returns "True"/"False" or "是"/"否"
         const lower = data.correctAnswer.toLowerCase();
         if (lower.includes('true') || lower.includes('是') || lower.includes('对')) data.correctAnswer = '正确';
         else data.correctAnswer = '错误';
      }
    }

    return {
      text: data.text,
      options: options,
      correctAnswer: data.correctAnswer,
      subject: data.subject || '综合',
      difficulty: data.difficulty as Difficulty || Difficulty.MEDIUM
    };

  } catch (error) {
    console.error("Error generating question:", error);
    return null;
  }
};
