import { supabase } from './supabaseClient';
import { Question, QuestionType, GradeLevel, Difficulty, QuestionCategory, QuestionFilters } from '../types';
import { logger } from './loggerService';

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
  is_deleted?: boolean;
  score: number;
  needs_grading: boolean;
  explanation: string | null;
}

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
  explanation: q.explanation || undefined,
  isDeleted: q.is_deleted
});

// --- API ---

export const getQuestions = async (
    page: number = 1, 
    limit: number = 10, 
    filters: QuestionFilters = {}
): Promise<{ data: Question[]; total: number }> => {
  // Construct Query
  let query = supabase
    .from('questions')
    .select('*', { count: 'exact' });

  // Handle isDeleted filter (default to false if not specified)
  if (filters.isDeleted === true) {
      query = query.eq('is_deleted', true);
  } else {
      query = query.neq('is_deleted', true);
  }

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
    logger.error('DB', 'Error fetching questions', { filters, page }, error);
    throw error;
  }
  
  // Use 'as any' safely here because we defined DBQuestion interface but supabase returns generalized types
  const mapped = (data as any[]).map(mapQuestionFromDB);
  
  return { data: mapped, total: count || 0 };
};

export const getQuestionsByIds = async (ids: string[], includeDeleted: boolean = false): Promise<Question[]> => {
    if (ids.length === 0) return [];
    // Chunking to avoid URL length limits if too many IDs (though unlikely for a quiz)
    const chunkSize = 20;
    const chunks = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        chunks.push(ids.slice(i, i + chunkSize));
    }

    let allQuestions: DBQuestion[] = [];

    for (const chunk of chunks) {
        let query = supabase.from('questions').select('*').in('id', chunk);
        if (!includeDeleted) {
            query = query.neq('is_deleted', true);
        }
        
        const { data, error } = await query;
        if (error) {
            logger.error('DB', 'Error fetching questions by IDs', { ids: chunk }, error);
            throw error;
        }
        if (data) {
            allQuestions = [...allQuestions, ...data as any[]];
        }
    }
    
    // Sort to match order of IDs (optional but nice)
    // const idMap = new Map(allQuestions.map(q => [q.id, q]));
    // return ids.map(id => idMap.get(id)).filter(q => !!q).map(mapQuestionFromDB);
    
    return allQuestions.map(mapQuestionFromDB);
};

export const restoreQuestion = async (id: string): Promise<void> => {
    const { error } = await supabase.from('questions').update({ is_deleted: false }).eq('id', id);
    if (error) {
        logger.error('DB', 'Error restoring question', { id }, error);
        throw error;
    }
    logger.info('DB', 'Question restored', { id });
};

export const hardDeleteQuestion = async (id: string): Promise<void> => {
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) {
        logger.error('DB', 'Error hard deleting question', { id }, error);
        throw error;
    }
    logger.info('DB', 'Question permanently deleted', { id });
};

// Legacy support for getting all questions (if needed by other components, though we should migrate)
export const getAllQuestionsRaw = async (): Promise<Question[]> => {
    const { data, error } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return (data as any[]).map(mapQuestionFromDB);
};

export const saveQuestion = async (question: Question): Promise<Question> => {
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

  const { data, error } = await supabase
    .from('questions')
    .insert(dbPayload)
    .select()
    .single();

  if (error) {
    logger.error('DB', 'Error saving question', { questionText: rest.text }, error);
    throw error;
  }
  
  const savedQuestion = mapQuestionFromDB(data as DBQuestion);
  logger.info('SYSTEM', 'Question created', { questionId: savedQuestion.id, subject: savedQuestion.subject });
  return savedQuestion;
};

export const updateQuestion = async (updatedQuestion: Question): Promise<void> => {
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
    
  if (error) {
    logger.error('DB', 'Error updating question', { questionId: updatedQuestion.id }, error);
    throw error;
  }
  
  logger.info('SYSTEM', 'Question updated', { questionId: updatedQuestion.id });
};

export const toggleQuestionVisibility = async (id: string): Promise<void> => {
  const { data, error: fetchError } = await supabase.from('questions').select('is_disabled').eq('id', id).single();
  
  if (fetchError) {
      logger.error('DB', 'Error fetching question status for toggle', { questionId: id }, fetchError);
      throw fetchError;
  }
  
  const newValue = !data.is_disabled;
  
  const { error } = await supabase.from('questions').update({ is_disabled: newValue }).eq('id', id);
  if (error) {
      logger.error('DB', 'Error toggling question visibility', { questionId: id, newValue }, error);
      throw error;
  }
  
  logger.info('SYSTEM', 'Question visibility toggled', { questionId: id, isDisabled: newValue });
};

export const deleteQuestion = async (id: string): Promise<void> => {
    // Soft delete
    const { error } = await supabase.from('questions').update({ is_deleted: true }).eq('id', id);
    if (error) {
        logger.error('DB', 'Error deleting question', { questionId: id }, error);
        throw error;
    }
    
    logger.warn('SYSTEM', 'Question soft deleted', { questionId: id });
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
