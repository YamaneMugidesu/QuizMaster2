import { supabase } from './supabaseClient';
import { Question, QuestionType, GradeLevel, Difficulty, QuestionCategory } from '../types';

// --- TYPES ---
export interface QuestionFilters {
    search?: string;
    subject?: string;
    gradeLevel?: GradeLevel;
    type?: QuestionType;
    difficulty?: Difficulty;
    category?: QuestionCategory;
}

// Internal DB Type Mapping
interface DBQuestion {
  id: string;
  type: string;
  text: string;
  image_urls: string[] | null;
  options: string[] | null;
  correct_answer: string;
  subject: string;
  grade_level: string;
  difficulty: string;
  category: string | null;
  created_at: number;
  is_disabled: boolean;
  score: number;
  needs_grading: boolean;
  explanation: string | null;
}

// --- STATE ---
let questionsCache: { data: Question[]; timestamp: number } | null = null;
let questionsQueryCache: Map<string, { data: Question[]; total: number; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const clearQuestionsCache = () => { 
    questionsCache = null; 
    questionsQueryCache.clear();
};

// --- HELPER: MAP DB TO FRONTEND ---
export const mapQuestionFromDB = (q: DBQuestion): Question => ({
  id: q.id,
  type: q.type as QuestionType,
  text: q.text,
  imageUrls: q.image_urls || [],
  options: q.options || undefined,
  correctAnswer: q.correct_answer,
  subject: q.subject,
  gradeLevel: q.grade_level as GradeLevel,
  difficulty: q.difficulty as Difficulty,
  category: (q.category as QuestionCategory) || QuestionCategory.BASIC,
  createdAt: q.created_at,
  isDisabled: q.is_disabled,
  score: q.score,
  needsGrading: q.needs_grading,
  explanation: q.explanation || undefined
});

// --- API ---

export const getQuestions = async (
    page: number = 1, 
    limit: number = 10, 
    filters: QuestionFilters = {}
): Promise<{ data: Question[]; total: number }> => {
  const cacheKey = `questions_${page}_${limit}_${JSON.stringify(filters)}`;
  
  // 1. Try to serve from cache if fresh
  if (questionsQueryCache.has(cacheKey)) {
      const cached = questionsQueryCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return { data: cached.data, total: cached.total };
      }
  }

  // Construct Query
  let query = supabase
    .from('questions')
    .select('*', { count: 'exact' })
    .neq('is_deleted', true);

  // Apply Filters
  if (filters.search) {
      query = query.ilike('text', `%${filters.search}%`);
  }
  if (filters.subject) {
      query = query.eq('subject', filters.subject);
  }
  if (filters.gradeLevel) {
      query = query.eq('grade_level', filters.gradeLevel);
  }
  if (filters.type) {
      query = query.eq('type', filters.type);
  }
  if (filters.difficulty) {
      query = query.eq('difficulty', filters.difficulty);
  }
  if (filters.category) {
      query = query.eq('category', filters.category);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);
  
  if (error) {
    console.error('Error fetching questions:', error);
    // 2. Fallback to stale cache if available
    if (questionsQueryCache.has(cacheKey)) {
        console.warn('Serving stale questions cache due to network error');
        const cached = questionsQueryCache.get(cacheKey)!;
        return { data: cached.data, total: cached.total };
    }
    return { data: [], total: 0 };
  }
  
  // Use 'as any' safely here because we defined DBQuestion interface but supabase returns generalized types
  const mapped = (data as any[]).map(mapQuestionFromDB);
  
  // 3. Update cache
  questionsQueryCache.set(cacheKey, { 
      data: mapped, 
      total: count || 0, 
      timestamp: Date.now() 
  });
  
  return { data: mapped, total: count || 0 };
};

export const getQuestionsByIds = async (ids: string[]): Promise<Question[]> => {
    if (ids.length === 0) return [];
    // Chunking to avoid URL length limits if too many IDs (though unlikely for a quiz)
    const chunkSize = 20;
    const chunks = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        chunks.push(ids.slice(i, i + chunkSize));
    }

    let allQuestions: Question[] = [];
    
    for (const chunk of chunks) {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .in('id', chunk);
        
        if (error) {
            console.error('Error fetching questions by IDs:', error);
            continue;
        }
        
        if (data) {
            const mapped = (data as any[]).map(mapQuestionFromDB);
            allQuestions = [...allQuestions, ...mapped];
        }
    }
    
    return allQuestions;
};

// Legacy support for getting all questions (if needed by other components, though we should migrate)
export const getAllQuestionsRaw = async (): Promise<Question[]> => {
    const { data, error } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return (data as any[]).map(mapQuestionFromDB);
};

export const saveQuestion = async (question: Question): Promise<void> => {
  clearQuestionsCache(); // Invalidate cache
  const { id, ...rest } = question;
  
  const dbPayload = {
    type: rest.type,
    text: rest.text,
    image_urls: rest.imageUrls,
    options: rest.options,
    correct_answer: rest.correctAnswer,
    subject: rest.subject,
    grade_level: rest.gradeLevel,
    difficulty: rest.difficulty,
    category: rest.category,
    created_at: rest.createdAt,
    is_disabled: rest.isDisabled || false,
    score: rest.score,
    needs_grading: rest.needsGrading,
    explanation: rest.explanation
  };

  const { error } = await supabase.from('questions').insert(dbPayload);
  if (error) console.error('Error saving question:', error);
};

export const updateQuestion = async (updatedQuestion: Question): Promise<void> => {
  clearQuestionsCache(); // Invalidate cache
  const dbPayload = {
    type: updatedQuestion.type,
    text: updatedQuestion.text,
    image_urls: updatedQuestion.imageUrls,
    options: updatedQuestion.options,
    correct_answer: updatedQuestion.correctAnswer,
    subject: updatedQuestion.subject,
    grade_level: updatedQuestion.gradeLevel,
    difficulty: updatedQuestion.difficulty,
    category: updatedQuestion.category,
    // created_at: updatedQuestion.createdAt, // Don't update created_at
    is_disabled: updatedQuestion.isDisabled,
    score: updatedQuestion.score,
    needs_grading: updatedQuestion.needsGrading,
    explanation: updatedQuestion.explanation
  };

  const { error } = await supabase
    .from('questions')
    .update(dbPayload)
    .eq('id', updatedQuestion.id);
    
  if (error) console.error('Error updating question:', error);
};

export const toggleQuestionVisibility = async (id: string): Promise<void> => {
  clearQuestionsCache(); // Invalidate cache
  const { data } = await supabase.from('questions').select('is_disabled').eq('id', id).single();
  if (data) {
    await supabase.from('questions').update({ is_disabled: !data.is_disabled }).eq('id', id);
  }
};

export const deleteQuestion = async (id: string): Promise<void> => {
  clearQuestionsCache(); // Invalidate cache
  // Soft delete
  const { error } = await supabase.from('questions').update({ is_deleted: true }).eq('id', id);
  if (error) console.error('Error deleting question:', error);
};

export const getAvailableQuestionCount = async (
    subjects: string[], 
    difficulties: Difficulty[], 
    gradeLevels: GradeLevel[],
    types: QuestionType[] = [],
    categories: QuestionCategory[] = []
): Promise<number> => {
    let query = supabase.from('questions').select('id', { count: 'exact', head: true }).eq('is_disabled', false).neq('is_deleted', true);

    if (subjects.length > 0) query = query.in('subject', subjects);
    if (difficulties.length > 0) query = query.in('difficulty', difficulties);
    if (gradeLevels.length > 0) query = query.in('grade_level', gradeLevels);
    if (types.length > 0) query = query.in('type', types);
    if (categories.length > 0) query = query.in('category', categories);

    const { count, error } = await query;
    return count || 0;
};
