import { supabase } from './supabaseClient';
import { QuizConfig, Question, QuestionType } from '../types';
import { mapQuestionFromDB, getQuestionsByIds } from './questionService';
import { logger } from './loggerService';

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
    is_deleted?: boolean;
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
  isPublished: c.is_published,
  isDeleted: c.is_deleted
});

// --- STATE ---
// Removed manual cache variables

// --- API ---

export const getQuizConfigs = async (includeDeleted: boolean = false, onlyDeleted: boolean = false): Promise<QuizConfig[]> => {
  let query = supabase.from('quiz_configs').select('*');
  
  if (onlyDeleted) {
      query = query.eq('is_deleted', true);
  } else if (!includeDeleted) {
      query = query.neq('is_deleted', true);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching configs:', error);
    throw error;
  }
  
  const mapped = (data || []).map(item => mapConfigFromDB(item as DBConfig));
  return mapped;
};

export const restoreQuizConfig = async (id: string): Promise<void> => {
    const { error } = await supabase.from('quiz_configs').update({ is_deleted: false }).eq('id', id);
    if (error) {
        logger.error('SYSTEM', 'Error restoring quiz config', { id }, error);
        throw error;
    }
    logger.info('SYSTEM', 'Quiz config restored', { id });
};

export const hardDeleteQuizConfig = async (id: string): Promise<void> => {
    const { error } = await supabase.from('quiz_configs').delete().eq('id', id);
    if (error) {
        logger.error('SYSTEM', 'Error hard deleting quiz config', { id }, error);
        throw error;
    }
    logger.info('SYSTEM', 'Quiz config permanently deleted', { id });
};

export const getQuizConfig = async (id: string, includeDeleted: boolean = false): Promise<QuizConfig | null> => {
  let query = supabase.from('quiz_configs').select('*').eq('id', id);
  
  if (!includeDeleted) {
      query = query.neq('is_deleted', true);
  }

  const { data, error } = await query.single();
  
  if (error) {
    console.error('Error fetching config:', error);
    throw error;
  }
  if (!data) return null;
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
        // 1. Fetch old data
        let oldConfig: QuizConfig | undefined;
        try {
            const { data, error } = await supabase.from('quiz_configs').select('*').eq('id', id).single();
            if (error) {
                console.error('Error fetching old config for diff:', error);
            }
            if (data) oldConfig = mapConfigFromDB(data as DBConfig);
        } catch (e) {
            console.error('Exception fetching old config:', e);
        }

        const { error } = await supabase.from('quiz_configs').update(dbPayload).eq('id', id);
        // === 第一道防线：数据库原子性检查 ===
        // 如果数据库更新失败，这里会直接抛出异常，中断流程。
        // 因此，如果代码能执行到下方，说明数据已 100% 安全存入数据库。
        if(error) {
            logger.error('SYSTEM', 'Error updating quiz config', { configName: rest.name }, error);
            throw error;
        }

        // === 第二道防线：日志系统的异常隔离 ===
        // 数据保存成功后，我们尝试计算变更详情（Diff）。
        // 使用 try-catch 包裹是为了"保底"：即使日志计算逻辑出错（非核心业务），
        // 也不应该反过来导致前端显示"保存失败"，因为数据其实已经保存好了。
        // 2. Diff (Safe Mode)
        try {
            const diff: any = {};
            if(oldConfig) {
                if(oldConfig.name !== rest.name) diff['name'] = { old: oldConfig.name, new: rest.name };
                if(oldConfig.passingScore !== rest.passingScore) diff['passingScore'] = { old: oldConfig.passingScore, new: rest.passingScore };
                if(oldConfig.totalQuestions !== rest.totalQuestions) diff['totalQuestions'] = { old: oldConfig.totalQuestions, new: rest.totalQuestions };
                if(oldConfig.description !== rest.description) diff['description'] = { old: oldConfig.description, new: rest.description };
                if(oldConfig.quizMode !== rest.quizMode) diff['quizMode'] = { old: oldConfig.quizMode, new: rest.quizMode };
                if(oldConfig.isPublished !== rest.isPublished) diff['isPublished'] = { old: oldConfig.isPublished, new: rest.isPublished };
                
                const oldPartsStr = JSON.stringify(oldConfig.parts);
                const newPartsStr = JSON.stringify(rest.parts);
                if(oldPartsStr !== newPartsStr) {
                    diff['parts'] = { 
                        old: `${oldConfig.parts.length} parts`, 
                        new: `${rest.parts.length} parts (Updated)` 
                    };
                }
            } else {
                diff['_warning'] = { old: 'Unknown', new: 'Old config not found - diff unavailable' };
            }

            logger.info('SYSTEM', 'Quiz config updated', { 
                configName: rest.name, 
                id,
                diff: Object.keys(diff).length > 0 ? diff : undefined 
            });
        } catch (logError) {
          console.error('Failed to calculate diff or log for quiz config', logError);
          logger.info('SYSTEM', 'Quiz config updated (Log Error)', { configName: rest.name, id });
      }
  } else {
      const { error } = await supabase.from('quiz_configs').insert(dbPayload);
      if(error) {
          logger.error('SYSTEM', 'Error creating quiz config', { configName: rest.name }, error);
          throw error;
      }
      logger.info('SYSTEM', 'Quiz config created', { 
          configName: rest.name,
          fullData: rest // Aligned with SystemMonitor UI
      });
  }
};

export const deleteQuizConfig = async (id: string): Promise<void> => {
    // Soft delete
    const { error } = await supabase.from('quiz_configs').update({ is_deleted: true }).eq('id', id);
    if (error) {
        logger.error('SYSTEM', 'Error deleting quiz config', { configId: id }, error);
        throw error;
    }
    logger.warn('SYSTEM', 'Quiz config soft deleted', { configId: id });
}

export const toggleQuizConfigVisibility = async (id: string): Promise<void> => {
    const { data, error: fetchError } = await supabase.from('quiz_configs').select('is_published').eq('id', id).single();
    
    if (fetchError) {
        console.error('Error fetching quiz config status:', fetchError);
        throw fetchError;
    }

    if (data) {
        const newValue = !data.is_published;
        const { error: updateError } = await supabase.from('quiz_configs').update({ is_published: newValue }).eq('id', id);
        if (updateError) {
            logger.error('SYSTEM', 'Error toggling quiz config visibility', { configId: id }, updateError);
            throw updateError;
        }
        logger.info('SYSTEM', 'Quiz config visibility toggled', { configId: id, isPublished: newValue });
    }
};

export const generateQuiz = async (configId: string): Promise<{ questions: Question[], configName: string, passingScore: number }> => {
    // Ensure we don't generate quiz from deleted config
    const { data: config, error } = await supabase
        .from('quiz_configs')
        .select('*')
        .eq('id', configId)
        .neq('is_deleted', true)
        .single();
    
    if (error) {
        console.error("Error fetching quiz config:", error);
        throw error;
    }

    if (!config) {
        throw new Error("Quiz configuration not found");
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
                blankCount: blankCount,
                quizPartName: part.name // Inject part name for UI display
            });
        }
    }

    return { 
        questions: finalQuestions, 
        configName: mappedConfig.name, 
        passingScore: mappedConfig.passingScore 
    };
};
