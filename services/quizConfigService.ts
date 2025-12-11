import { supabase } from './supabaseClient';
import { QuizConfig, Question, QuestionType } from '../types';
import { mapQuestionFromDB } from './questionService';

// Internal DB Type
interface DBConfig {
    id: string;
    name: string;
    description: string;
    passing_score: number;
    parts: any[];
    total_questions: number;
    created_at: number;
    quiz_mode: string;
    is_published: boolean;
}

const mapConfigFromDB = (c: DBConfig): QuizConfig => ({
  id: c.id,
  name: c.name,
  description: c.description,
  passingScore: c.passing_score,
  parts: c.parts || [],
  totalQuestions: c.total_questions,
  createdAt: c.created_at,
  quizMode: (c.quiz_mode as any) || 'practice',
  isPublished: c.is_published
});

// --- STATE ---
let quizConfigsCache: { data: QuizConfig[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const clearQuizConfigsCache = () => { quizConfigsCache = null; };

// --- API ---

export const getQuizConfigs = async (): Promise<QuizConfig[]> => {
  // Check cache
  if (quizConfigsCache && (Date.now() - quizConfigsCache.timestamp < CACHE_TTL)) {
    return quizConfigsCache.data;
  }

  const { data, error } = await supabase.from('quiz_configs').select('*').neq('is_deleted', true);
  if (error) {
    console.error('Error fetching configs:', error);
    return [];
  }
  
  const mapped = (data || []).map(item => mapConfigFromDB(item as DBConfig));
  // Update cache
  quizConfigsCache = { data: mapped, timestamp: Date.now() };
  return mapped;
};

export const getQuizConfig = async (id: string): Promise<QuizConfig | null> => {
  const { data, error } = await supabase.from('quiz_configs').select('*').eq('id', id).single();
  if (error || !data) {
    if (error) console.error('Error fetching config:', error);
    return null;
  }
  return mapConfigFromDB(data as DBConfig);
};

export const saveQuizConfig = async (config: QuizConfig): Promise<void> => {
  quizConfigsCache = null; // Invalidate cache
  const { id, ...rest } = config;
  const dbPayload = {
    name: rest.name,
    description: rest.description,
    passing_score: rest.passingScore,
    parts: rest.parts,
    total_questions: rest.totalQuestions,
    created_at: rest.createdAt,
    quiz_mode: rest.quizMode || 'practice',
    is_published: rest.isPublished
  };

  if (id && id.length > 20) {
      const { error } = await supabase.from('quiz_configs').update(dbPayload).eq('id', id);
      if(error) console.error(error);
  } else {
      const { error } = await supabase.from('quiz_configs').insert(dbPayload);
      if(error) console.error(error);
  }
};

export const deleteQuizConfig = async (id: string): Promise<void> => {
    quizConfigsCache = null; // Invalidate cache
    // Soft delete
    await supabase.from('quiz_configs').update({ is_deleted: true }).eq('id', id);
}

export const toggleQuizConfigVisibility = async (id: string): Promise<void> => {
    quizConfigsCache = null;
    const { data } = await supabase.from('quiz_configs').select('is_published').eq('id', id).single();
    if (data) {
        await supabase.from('quiz_configs').update({ is_published: !data.is_published }).eq('id', id);
    }
};

export const generateQuiz = async (configId: string): Promise<{ questions: Question[], configName: string, passingScore: number }> => {
    const { data: config } = await supabase.from('quiz_configs').select('*').eq('id', configId).single();
    
    if (!config) {
        return { questions: [], configName: 'Unknown', passingScore: 0 };
    }

    const mappedConfig = mapConfigFromDB(config as DBConfig);
    let allQuestions: Question[] = [];
    const usedQuestionIds = new Set<string>();

    for (const part of mappedConfig.parts) {
        let query = supabase.from('questions').select('*').eq('is_disabled', false).neq('is_deleted', true);
        
        if (part.subjects && part.subjects.length > 0) query = query.in('subject', part.subjects);
        if (part.difficulties && part.difficulties.length > 0) query = query.in('difficulty', part.difficulties);
        if (part.gradeLevels && part.gradeLevels.length > 0) query = query.in('grade_level', part.gradeLevels);
        if (part.categories && part.categories.length > 0) query = query.in('category', part.categories);
        
        // Fix: Use questionTypes (from interface) instead of types
        // Also support 'types' for backward compatibility if it exists in DB
        const types = (part as any).questionTypes || (part as any).types;
        if (types && types.length > 0) query = query.in('type', types);

        const { data: questions } = await query;
        
        if (questions) {
            let mappedQuestions = (questions as any[]).map(mapQuestionFromDB);
            
            // Filter out questions already used in previous parts
            mappedQuestions = mappedQuestions.filter(q => !usedQuestionIds.has(q.id));

            // Shuffle and slice
            const shuffled = mappedQuestions.sort(() => 0.5 - Math.random());
            
            // Apply score from config part
            const selectedQuestions = shuffled.slice(0, part.count).map(q => {
                let blankCount = undefined;
                if (q.type === QuestionType.FILL_IN_THE_BLANK) {
                    try {
                        const parsed = JSON.parse(q.correctAnswer);
                        if (Array.isArray(parsed)) blankCount = parsed.length;
                        else blankCount = 1;
                    } catch {
                        if (q.correctAnswer && q.correctAnswer.includes(';&&;')) {
                            blankCount = q.correctAnswer.split(';&&;').length;
                        } else {
                            blankCount = 1;
                        }
                    }
                }

                // Add to used set
                usedQuestionIds.add(q.id);

                return {
                    ...q,
                    score: part.score, // Override question score with config part score
                    correctAnswer: '', // SECURITY: Clear correct answer for client
                    blankCount: blankCount
                };
            });

            allQuestions = [...allQuestions, ...selectedQuestions];
        }
    }

    return { 
        questions: allQuestions, 
        configName: mappedConfig.name, 
        passingScore: mappedConfig.passingScore 
    };
};
