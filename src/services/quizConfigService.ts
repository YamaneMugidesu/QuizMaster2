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
    // New Global Fields
    subjects?: string[];
    grade_levels?: string[];
    content_categories?: string[];
    allow_one_attempt?: boolean;
    duration?: number;
    last_reset_at?: number;
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
  isDeleted: c.is_deleted,
  allowOneAttempt: c.allow_one_attempt,
  duration: c.duration || 0,
  lastResetAt: c.last_reset_at || 0,
  // Map new global fields
  subjects: c.subjects || [],
  gradeLevels: (c.grade_levels as any) || [],
  contentCategories: c.content_categories || []
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

export const resetQuizAttempts = async (id: string): Promise<void> => {
    const timestamp = Date.now();
    const { error } = await supabase.from('quiz_configs').update({ last_reset_at: timestamp }).eq('id', id);
    if (error) {
        logger.error('SYSTEM', 'Error resetting quiz attempts', { id }, error);
        throw error;
    }
    logger.info('SYSTEM', 'Quiz attempts reset', { id, timestamp });
};

export const saveQuizConfig = async (config: QuizConfig): Promise<void> => {
  const { id, ...rest } = config;
  const dbPayload = {
    id: id, // Explicitly include ID to ensure frontend/backend consistency
    name: rest.name,
    description: rest.description,
    passing_score: rest.passingScore,
    parts: rest.parts,
    total_questions: rest.totalQuestions,
    created_at: rest.createdAt,
    quiz_mode: rest.quizMode || 'practice',
    is_published: rest.isPublished ?? false,
    is_deleted: false,
    allow_one_attempt: rest.allowOneAttempt || false,
    duration: rest.duration || 0,
    last_reset_at: rest.lastResetAt || 0,
    // New Global Fields
    subjects: rest.subjects || [],
    grade_levels: rest.gradeLevels || [],
    content_categories: rest.contentCategories || []
  };

  // Check if updating existing config (must have valid UUID AND exist in DB)
  let isUpdate = false;
  let oldConfig: QuizConfig | undefined;

  if (id && id.length > 30) {
      // Try to find the existing record
      const { data, error } = await supabase.from('quiz_configs').select('*').eq('id', id);
      
      if (!error && data && data.length > 0) {
          isUpdate = true;
          oldConfig = mapConfigFromDB(data[0] as DBConfig);
      }
  }

  if (isUpdate) {
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

export const generateQuiz = async (configId: string): Promise<{ 
    questions: Question[], 
    configName: string, 
    passingScore: number, 
    progressId?: string,
    savedAnswers?: Record<string, string>,
    currentIndex?: number,
    duration?: number, // Total duration limit (minutes)
    remainingTime?: number, // Remaining seconds
    isResumed?: boolean // Flag to indicate if this is a resumed session
}> => {
    // 0. Check for existing active session (Quiz Progress)
    const { data: user } = await supabase.auth.getUser();
    
    // SECURITY CHECK: Verify user role
    // Admins can access unpublished quizzes for preview/testing purposes
    // Regular users must be restricted to published quizzes only
    let isAdmin = false;
    if (user && user.user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.user.id)
            .single();
        if (profile && (profile.role === 'ADMIN' || profile.role === 'SUPER_ADMIN')) {
            isAdmin = true;
        }
    }

    if (user && user.user) {
        const { data: existingProgress, error: progressError } = await supabase
            .from('quiz_progress')
            .select('*')
            .eq('user_id', user.user.id)
            .eq('config_id', configId)
            .eq('status', 'in_progress')
            .single();

        // Fetch config details first to get duration and other settings
        const { data: config } = await supabase
            .from('quiz_configs')
            .select('name, passing_score, duration, allow_one_attempt, last_reset_at, is_published')
            .eq('id', configId)
            .single();

        // SECURITY CHECK: Unpublished Quiz Access
        if (config && !config.is_published && !isAdmin) {
             // If quiz is unpublished and user is not admin, block access
             // This prevents direct URL access to unpublished content
             throw new Error("This quiz is currently unavailable.");
        }

        // 0.1 Check for "Allow One Attempt" restriction
        if (config && config.allow_one_attempt) {
            let query = supabase
                .from('quiz_results')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.user.id)
                .eq('config_id', configId)
                .eq('status', 'completed');
            
            // Check last_reset_at to ignore results before the reset
            if (config.last_reset_at && config.last_reset_at > 0) {
                query = query.gt('timestamp', config.last_reset_at);
            }

            const { count } = await query;
            
            if (count && count > 0) {
                // If user already completed this quiz, and we are not resuming an in-progress session
                // (Wait, if completed, there shouldn't be an in-progress session usually, but let's be safe)
                // If there IS an in-progress session, it might be a zombie session or user re-opened before it was marked completed?
                // But generally, if result exists, they are done.
                // However, we should prioritize resuming if a session exists? 
                // No, if result exists, they are DONE. Any in-progress session is likely stale or invalid if strict mode.
                // But let's stick to the requirement: "Block if already attempted".
                if (!existingProgress) {
                     throw new Error("This quiz allows only one attempt and you have already completed it.");
                }
            }
        }

        if (existingProgress) {
            logger.info('USER_ACTION', 'Checking existing quiz session', { userId: user.user.id, configId });
            
            // Check if existing session is valid (has questions)
            const hasQuestions = existingProgress.questions && Array.isArray(existingProgress.questions) && existingProgress.questions.length > 0;
            
            if (!hasQuestions) {
                logger.warn('USER_ACTION', 'Found invalid progress session (empty questions), aborting and generating new one', { progressId: existingProgress.id });
                
                // Mark invalid session as aborted
                await supabase
                    .from('quiz_progress')
                    .update({ status: 'aborted', last_updated: Date.now() })
                    .eq('id', existingProgress.id);
                
                // Continue to generate new quiz...
            } else {
                logger.info('USER_ACTION', 'Resuming valid existing quiz session', { progressId: existingProgress.id });

                // Restore questions from JSON
                // Note: The questions stored in DB should already have correctAnswer stripped, but we double check
                const restoredQuestions = (existingProgress.questions as any[]).map(q => ({
                    ...q,
                    correctAnswer: '' // SECURITY: Ensure answer is cleared
                }));

                // Calculate remaining time
                let remainingTime = undefined;
                if (config && config.duration > 0) {
                    const now = Date.now();
                    const startTime = existingProgress.start_time;
                    const elapsedSeconds = Math.floor((now - startTime) / 1000);
                    const totalSeconds = config.duration * 60;
                    remainingTime = Math.max(0, totalSeconds - elapsedSeconds);
                }

                return {
                    questions: restoredQuestions,
                    configName: config?.name || 'Restored Quiz',
                    passingScore: config?.passing_score || 0,
                    progressId: existingProgress.id,
                    savedAnswers: existingProgress.answers || {},
                    currentIndex: existingProgress.current_index || 0,
                    duration: config?.duration || 0,
                    remainingTime: remainingTime,
                    isResumed: true
                };
            }
        }
    }

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

    // SECURITY CHECK: Unpublished Quiz Access (Double check for non-session path)
    if (!config.is_published && !isAdmin) {
        throw new Error("This quiz is currently unavailable.");
    }

    const mappedConfig = mapConfigFromDB(config as DBConfig);
    
    // 1. Parallel Fetch of Potential IDs for all parts
    const partPromises = mappedConfig.parts.map(async (part) => {
        // Use 'questions_safe_view' for question selection to ensure accessibility for non-admin users.
        // The 'questions' table is restricted by RLS/Permissions for standard users, while the view is granted access.
        let query = supabase.from('questions_safe_view').select('id');
        
        // Use Global Filters from QuizConfig (mappedConfig)
        if (mappedConfig.subjects && mappedConfig.subjects.length > 0) query = query.in('subject', mappedConfig.subjects);
        if (mappedConfig.gradeLevels && mappedConfig.gradeLevels.length > 0) query = query.in('grade_level', mappedConfig.gradeLevels);
        if (mappedConfig.contentCategories && mappedConfig.contentCategories.length > 0) query = query.in('content_category', mappedConfig.contentCategories);

        // Use Part-specific Filters
        // if (part.subjects && part.subjects.length > 0) query = query.in('subject', part.subjects); // Removed
        if (part.difficulties && part.difficulties.length > 0) query = query.in('difficulty', part.difficulties);
        // if (part.gradeLevels && part.gradeLevels.length > 0) query = query.in('grade_level', part.gradeLevels); // Removed
        if (part.categories && part.categories.length > 0) query = query.in('category', part.categories);
        
        // Support both 'questionTypes' (new) and 'types' (legacy)
        const types = (part as any).questionTypes || (part as any).types;
        if (types && types.length > 0) query = query.in('type', types);

        const { data, error } = await query;

        if (error) {
            logger.error('SYSTEM', 'Error fetching candidate questions for quiz generation', { partName: part.name, error });
            return { part, candidateIds: [] };
        }

        return { part, candidateIds: data ? data.map(q => q.id) : [] };
    });

    const results = await Promise.all(partPromises);

    // Debug: Log candidate counts per part
    results.forEach((res, idx) => {
        if (res.candidateIds.length < res.part.count) {
            logger.warn('SYSTEM', `Part ${idx + 1} (${res.part.name}) has insufficient questions`, {
                required: res.part.count,
                available: res.candidateIds.length,
                partConfig: res.part
            });
        }
    });

    // 2. In-memory Selection (Sequential to handle duplicates across parts)
    const usedQuestionIds = new Set<string>();
    const orderedQuestionIds: string[] = [];
    const questionPartMap = new Map<string, any>(); // Map ID to Part Config

    // Helper: Fisher-Yates Shuffle
    const shuffleArray = (array: string[]) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    for (const { part, candidateIds } of results) {
        // Filter used
        const availableIds = candidateIds.filter((id: string) => !usedQuestionIds.has(id));
        
        // Shuffle using Fisher-Yates
        const shuffled = shuffleArray([...availableIds]);
        
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
    // Use secureMode=true to fetch from questions_safe_view.
    const questions = await getQuestionsByIds(orderedQuestionIds, false, true);

    // 3.1 Fetch Blank Counts (Metadata)
    // Since questions_safe_view doesn't have correct_answer, we need to fetch the pre-calculated blank_count
    // from our new secure view 'questions_metadata_view'.
    const blankCountMap = new Map<string, number>();
    try {
        const { data: metadata } = await supabase
            .from('questions_metadata_view')
            .select('id, blank_count')
            .in('id', orderedQuestionIds);
        
        if (metadata) {
            metadata.forEach((m: any) => blankCountMap.set(m.id, m.blank_count));
        }
    } catch (e) {
        console.error("Failed to fetch blank counts:", e);
    }

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
            let blankCount = blankCountMap.get(id) || 1; // Use fetched metadata or default to 1

            finalQuestions.push({
                ...q,
                score: part.score, // Override question score with config part score
                correctAnswer: '', // SECURITY: Clear correct answer for client
                blankCount: blankCount,
                quizPartName: part.name // Inject part name for UI display
            });
        }
    }

    // 5. Create new session (Quiz Progress)
    if (user && user.user) {
        try {
            // Prepare questions for storage (strip sensitive info if any remaining, though correctAns is already empty string)
            // We store the exact set of questions generated
            const questionsToStore = finalQuestions.map(q => ({
                ...q,
                correctAnswer: '' 
            }));

            const { data: newProgress, error: createError } = await supabase
                .from('quiz_progress')
                .insert({
                    user_id: user.user.id,
                    config_id: configId,
                    start_time: Date.now(),
                    last_updated: Date.now(),
                    questions: questionsToStore,
                    status: 'in_progress'
                })
                .select()
                .single();

            if (createError) {
                // Handle race condition: if unique constraint violated, it means another session started in parallel
                // We should try to fetch it instead
                if (createError.code === '23505') { // Unique violation
                    logger.warn('USER_ACTION', 'Race condition detected in quiz generation, fetching existing session', { userId: user.user.id, configId });
                     const { data: existingProgress } = await supabase
                        .from('quiz_progress')
                        .select('*')
                        .eq('user_id', user.user.id)
                        .eq('config_id', configId)
                        .single();
                    
                    if (existingProgress) {
                         // Calculate remaining time for race-condition-fetched session
                         let remainingTime = undefined;
                         if (mappedConfig.duration && mappedConfig.duration > 0) {
                             const now = Date.now();
                             const startTime = existingProgress.start_time;
                             const elapsedSeconds = Math.floor((now - startTime) / 1000);
                             const totalSeconds = mappedConfig.duration * 60;
                             remainingTime = Math.max(0, totalSeconds - elapsedSeconds);
                         }

                         return {
                            questions: (existingProgress.questions as any[]),
                            configName: mappedConfig.name,
                            passingScore: mappedConfig.passingScore,
                            progressId: existingProgress.id,
                            savedAnswers: existingProgress.answers || {},
                            currentIndex: existingProgress.current_index || 0,
                            duration: mappedConfig.duration || 0,
                            remainingTime: remainingTime
                        };
                    }
                }
                
                logger.error('USER_ACTION', 'Failed to create quiz progress session', { userId: user.user.id }, createError);
                // Fallback to return questions without session (not ideal but better than crash)
            } else {
                 return { 
                    questions: finalQuestions, 
                    configName: mappedConfig.name, 
                    passingScore: mappedConfig.passingScore,
                    progressId: newProgress.id,
                    savedAnswers: {},
                    currentIndex: 0,
                    duration: mappedConfig.duration || 0,
                    remainingTime: mappedConfig.duration ? mappedConfig.duration * 60 : undefined,
                    isResumed: false
                };
            }
        } catch (e) {
            logger.error('USER_ACTION', 'Exception creating quiz progress', { error: e });
        }
    }

    return { 
        questions: finalQuestions, 
        configName: mappedConfig.name, 
        passingScore: mappedConfig.passingScore 
    };
};

export const saveQuizProgress = async (configId: string, answers: Record<string, string>, currentIndex: number): Promise<void> => {
    const { data: user } = await supabase.auth.getUser();
    if (!user || !user.user) return;

    try {
        const { error } = await supabase
            .from('quiz_progress')
            .update({
                answers: answers,
                current_index: currentIndex,
                last_updated: Date.now()
            })
            .eq('user_id', user.user.id)
            .eq('config_id', configId)
            .eq('status', 'in_progress');

        if (error) {
            // Silently fail or log warning (don't disrupt user)
            console.warn('Failed to save quiz progress', error);
        }
    } catch (e) {
        console.warn('Exception saving quiz progress', e);
    }
};

export const updateQuizConfigsContentCategory = async (fromCategory: string, toCategory: string): Promise<void> => {
    if (!fromCategory || !toCategory || fromCategory === toCategory) return;

    // 1. Fetch configs that have this category
    const { data: configs, error: fetchError } = await supabase
        .from('quiz_configs')
        .select('id, content_categories')
        .contains('content_categories', [fromCategory]);

    if (fetchError) {
        logger.error('SYSTEM', 'Error fetching quiz configs for category update', { fromCategory }, fetchError);
        throw fetchError;
    }

    if (!configs || configs.length === 0) return;

    // 2. Update each config
    const updates = configs.map(async (config: any) => {
        const categories = config.content_categories || [];
        const newCategories = categories.map((c: string) => c === fromCategory ? toCategory : c);
        
        // Remove duplicates just in case
        const uniqueCategories = Array.from(new Set(newCategories));

        const { error: updateError } = await supabase
            .from('quiz_configs')
            .update({ content_categories: uniqueCategories })
            .eq('id', config.id);

        if (updateError) {
             logger.error('SYSTEM', 'Error updating quiz config category', { configId: config.id, fromCategory, toCategory }, updateError);
        }
    });

    await Promise.all(updates);
    logger.info('SYSTEM', 'Updated content category for quiz configs', { fromCategory, toCategory, count: configs.length });
};
