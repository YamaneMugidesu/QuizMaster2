import { supabase } from './supabaseClient';
import { QuizConfig, Question, QuestionType } from '../types';
import { mapQuestionFromDB, getQuestionsByIds } from './questionService';

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
// Removed manual cache variables

// --- API ---

export const getQuizConfigs = async (): Promise<QuizConfig[]> => {
  const { data, error } = await supabase.from('quiz_configs').select('*').neq('is_deleted', true);
  if (error) {
    console.error('Error fetching configs:', error);
    return [];
  }
  
  const mapped = (data || []).map(item => mapConfigFromDB(item as DBConfig));
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
    // Soft delete
    await supabase.from('quiz_configs').update({ is_deleted: true }).eq('id', id);
}

export const toggleQuizConfigVisibility = async (id: string): Promise<void> => {
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
    
    // 1. Parallel Fetch of Potential IDs for all parts
    const partPromises = mappedConfig.parts.map(async (part) => {
        let query = supabase.from('questions').select('id').eq('is_disabled', false).neq('is_deleted', true);
        
        if (part.subjects && part.subjects.length > 0) query = query.in('subject', part.subjects);
        if (part.difficulties && part.difficulties.length > 0) query = query.in('difficulty', part.difficulties);
        if (part.gradeLevels && part.gradeLevels.length > 0) query = query.in('grade_level', part.gradeLevels);
        if (part.categories && part.categories.length > 0) query = query.in('category', part.categories);
        
        // Support both 'questionTypes' (new) and 'types' (legacy)
        const types = (part as any).questionTypes || (part as any).types;
        if (types && types.length > 0) query = query.in('type', types);

        const { data } = await query;
        return { part, candidateIds: data ? data.map(q => q.id) : [] };
    });

    const results = await Promise.all(partPromises);

    // 2. In-memory Selection (Sequential to handle duplicates across parts)
    const usedQuestionIds = new Set<string>();
    const orderedQuestionIds: string[] = [];
    const questionPartMap = new Map<string, any>(); // Map ID to Part Config

    for (const { part, candidateIds } of results) {
        // Filter used
        const availableIds = candidateIds.filter((id: string) => !usedQuestionIds.has(id));
        
        // Shuffle
        const shuffled = availableIds.sort(() => 0.5 - Math.random());
        
        // Slice
        const selected = shuffled.slice(0, part.count);
        
        selected.forEach((id: string) => {
            usedQuestionIds.add(id);
            orderedQuestionIds.push(id);
            questionPartMap.set(id, part);
        });
    }

    if (orderedQuestionIds.length === 0) {
        return { questions: [], configName: mappedConfig.name, passingScore: mappedConfig.passingScore };
    }

    // 3. Batch Fetch Details
    const questions = await getQuestionsByIds(orderedQuestionIds);

    // 4. Map back to result structure (restore order and apply part settings)
    const finalQuestions: Question[] = [];
    
    // Create a lookup map for fetched questions
    const fetchedQuestionsMap = new Map<string, Question>();
    questions.forEach(q => fetchedQuestionsMap.set(q.id, q));

    // Iterate through ordered IDs to maintain order and apply specific part settings
    for (const id of orderedQuestionIds) {
        const q = fetchedQuestionsMap.get(id);
        const part = questionPartMap.get(id);

        if (q && part) {
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

            finalQuestions.push({
                ...q,
                score: part.score, // Override question score with config part score
                correctAnswer: '', // SECURITY: Clear correct answer for client
                blankCount: blankCount
            });
        }
    }

    return { 
        questions: finalQuestions, 
        configName: mappedConfig.name, 
        passingScore: mappedConfig.passingScore 
    };
};
