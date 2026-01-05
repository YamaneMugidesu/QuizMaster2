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
  // Optimization: Only select fields needed for the list view
  // We exclude heavy fields like image_urls (Base64), options, explanation
  let query = supabase
    .from('questions')
    .select('id, type, text, correct_answer, subject, grade_level, difficulty, category, created_at, is_disabled, is_deleted, score', { count: 'exact' });

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

export const getQuestionById = async (id: string): Promise<Question | null> => {
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('id', id)
        .single();
    
    if (error) {
        logger.error('DB', 'Error fetching question by ID', { id }, error);
        return null;
    }
    
    return mapQuestionFromDB(data as DBQuestion);
};

export const getQuestionsByIds = async (ids: string[], includeDeleted: boolean = false): Promise<Question[]> => {
    // Filter out empty IDs and ensure unique
    const uniqueIds = Array.from(new Set(ids.filter(id => id && id.trim() !== '')));
    
    if (uniqueIds.length === 0) return [];

    // Filter out invalid UUIDs to prevent "invalid input syntax for type uuid" error
    // UUID regex pattern (standard)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validIds = uniqueIds.filter(id => uuidRegex.test(id));

    if (validIds.length === 0) {
        if (uniqueIds.length > 0) {
            logger.warn('DB', 'All provided IDs were invalid UUIDs', { invalidIds: uniqueIds });
        }
        return [];
    }

    if (validIds.length < uniqueIds.length) {
        logger.warn('DB', 'Some IDs were filtered out because they are not valid UUIDs', { 
            totalProvided: uniqueIds.length, 
            validCount: validIds.length,
            invalidSample: uniqueIds.filter(id => !uuidRegex.test(id)).slice(0, 3)
        });
    }

    // Chunking to avoid URL length limits if too many IDs
    // Optimized chunk size for better reliability
    const chunkSize = 15;
    const chunks = [];
    for (let i = 0; i < validIds.length; i += chunkSize) {
        chunks.push(validIds.slice(i, i + chunkSize));
    }

    let allQuestions: DBQuestion[] = [];

    // Helper for retry logic
    const fetchChunk = async (chunk: string[], retries = 3): Promise<any[]> => {
        try {
            let query = supabase.from('questions').select('*').in('id', chunk);
            if (!includeDeleted) {
                query = query.neq('is_deleted', true);
            }
            
            const { data, error } = await query;
            if (error) throw error;
            return data as any[];
        } catch (error: any) {
            if (retries > 0) {
                // Exponential backoff: 500ms, 1000ms, 2000ms
                const delay = 500 * Math.pow(2, 3 - retries);
                logger.warn('DB', `Retrying fetch for chunk (attempts left: ${retries})`, { chunkSample: chunk[0], delay });
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchChunk(chunk, retries - 1);
            }
            // Log full error on final failure
            logger.error('DB', 'Failed to fetch chunk after retries', { chunk, error: error.message || error }, error);
            throw error;
        }
    };

    // Execute fetches sequentially to reduce concurrent connection pressure
    // Parallel fetching can trigger rate limits or connection timeouts
    for (const chunk of chunks) {
        try {
            const data = await fetchChunk(chunk);
            if (data) {
                allQuestions = [...allQuestions, ...data];
            }
        } catch (e) {
            // Continue fetching other chunks even if one fails, but log it
            logger.error('DB', 'Skipping failed chunk', { chunkSample: chunk[0] });
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
    explanation: rest.explanation,
    is_deleted: false
  };

  const { data, error } = await supabase
    .from('questions')
    .insert(dbPayload)
    .select()
    .single();

  // === 第一道防线：数据库写入确认 ===
  // Supabase 的 insert 操作是原子性的。如果有 error，说明数据库拒绝了写入。
  // 此时抛出异常，前端会收到错误提示，流程终止。
  if (error) {
    logger.error('DB', 'Error saving question', { questionText: rest.text }, error);
    throw error;
  }
  
  const savedQuestion = mapQuestionFromDB(data as DBQuestion);
  
  // === 日志数据增强 ===
  // 执行到这里，说明数据库已成功保存。
  // 为了防止数据库返回的数据不完整（如因网络波动导致 select 缺字段）影响审计日志，
  // 我们将"前端提交的完整数据"与"数据库返回的数据"合并，确保日志永远是完整的。
  const logData = { ...rest, ...savedQuestion };
  
  logger.info('SYSTEM', 'Question created', { 
    questionId: savedQuestion.id, 
    subject: logData.subject,
    type: logData.type,
    text: (logData.text || '').substring(0, 100) + ((logData.text || '').length > 100 ? '...' : ''),
    fullData: logData 
  });
  return savedQuestion;
};

export const updateQuestion = async (updatedQuestion: Question): Promise<void> => {
  // 1. Fetch old data for diff logging
  let oldQuestion: Question | undefined;
  try {
      const { data, error } = await supabase.from('questions').select('*').eq('id', updatedQuestion.id).single();
      if (error) {
          console.error('Error fetching old question for diff:', error);
      }
      if (data) {
          oldQuestion = mapQuestionFromDB(data as DBQuestion);
      }
  } catch (e) {
      console.error('Exception fetching old question:', e);
  }

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
  
  // 2. Calculate Diff (Safe Mode)
  try {
      const diff: Record<string, { old: any, new: any }> = {};
      if (oldQuestion) {
          if (oldQuestion.text !== updatedQuestion.text) diff['text'] = { old: oldQuestion.text, new: updatedQuestion.text };
          if (oldQuestion.score !== updatedQuestion.score) diff['score'] = { old: oldQuestion.score, new: updatedQuestion.score };
          if (oldQuestion.type !== updatedQuestion.type) diff['type'] = { old: oldQuestion.type, new: updatedQuestion.type };
          if (oldQuestion.difficulty !== updatedQuestion.difficulty) diff['difficulty'] = { old: oldQuestion.difficulty, new: updatedQuestion.difficulty };
          if (oldQuestion.subject !== updatedQuestion.subject) diff['subject'] = { old: oldQuestion.subject, new: updatedQuestion.subject };
          if (oldQuestion.gradeLevel !== updatedQuestion.gradeLevel) diff['gradeLevel'] = { old: oldQuestion.gradeLevel, new: updatedQuestion.gradeLevel };
          if (oldQuestion.category !== updatedQuestion.category) diff['category'] = { old: oldQuestion.category, new: updatedQuestion.category };
          if (oldQuestion.correctAnswer !== updatedQuestion.correctAnswer) diff['correctAnswer'] = { old: oldQuestion.correctAnswer, new: updatedQuestion.correctAnswer };
          if (oldQuestion.explanation !== updatedQuestion.explanation) diff['explanation'] = { old: oldQuestion.explanation, new: updatedQuestion.explanation };
          if (oldQuestion.needsGrading !== updatedQuestion.needsGrading) diff['needsGrading'] = { old: oldQuestion.needsGrading, new: updatedQuestion.needsGrading };
          if (oldQuestion.isDisabled !== updatedQuestion.isDisabled) diff['isDisabled'] = { old: oldQuestion.isDisabled, new: updatedQuestion.isDisabled };
          
          if (JSON.stringify(oldQuestion.options) !== JSON.stringify(updatedQuestion.options)) diff['options'] = { old: oldQuestion.options, new: updatedQuestion.options };
          if (JSON.stringify(oldQuestion.imageUrls) !== JSON.stringify(updatedQuestion.imageUrls)) diff['imageUrls'] = { old: oldQuestion.imageUrls, new: updatedQuestion.imageUrls };
      } else {
          diff['_warning'] = { old: 'Unknown', new: 'Old question not found - diff unavailable' };
      }

      logger.info('SYSTEM', 'Question updated', { 
        questionId: updatedQuestion.id,
        diff: Object.keys(diff).length > 0 ? diff : undefined
      });
  } catch (logError) {
      // Fallback logging if diff calculation fails
      console.error('Failed to calculate diff or log', logError);
      logger.info('SYSTEM', 'Question updated (Log Error)', { questionId: updatedQuestion.id });
  }
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
