
import { Question, QuestionType, User, UserRole, QuizResult, Difficulty, QuizConfig, GradeLevel, QuestionCategory } from '../types';
import { supabase } from './supabaseClient';

// --- HELPER: MAP DB TO FRONTEND ---
const mapQuestionFromDB = (q: any): Question => ({
  id: q.id,
  type: q.type as QuestionType,
  text: q.text,
  imageUrls: q.image_urls || [],
  options: q.options || undefined,
  correctAnswer: q.correct_answer,
  subject: q.subject,
  gradeLevel: q.grade_level as GradeLevel,
  difficulty: q.difficulty as Difficulty,
  category: q.category as QuestionCategory || QuestionCategory.BASIC,
  createdAt: q.created_at,
  isDisabled: q.is_disabled,
  score: q.score,
  needsGrading: q.needs_grading,
  explanation: q.explanation
});

const mapConfigFromDB = (c: any): QuizConfig => ({
  id: c.id,
  name: c.name,
  description: c.description,
  passingScore: c.passing_score,
  parts: c.parts || [],
  totalQuestions: c.total_questions,
  createdAt: c.created_at,
  quizMode: c.quiz_mode || 'practice',
  isPublished: c.is_published
});

const mapResultFromDB = (r: any): QuizResult => ({
  id: r.id,
  userId: r.user_id,
  username: r.username,
  timestamp: r.timestamp,
  score: r.score,
  maxScore: r.max_score,
  passingScore: r.passing_score,
  isPassed: r.is_passed,
  totalQuestions: r.total_questions,
  attempts: r.attempts || [],
  configId: r.config_id,
  configName: r.config_name,
  status: r.status,
  duration: r.duration
});

// --- CACHE STATE ---
let questionsCache: { data: Question[]; timestamp: number } | null = null;
let quizConfigsCache: { data: QuizConfig[]; timestamp: number } | null = null;
let resultsCache: Map<string, { data: any; total?: number; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const clearQuestionsCache = () => { questionsCache = null; };
export const clearQuizConfigsCache = () => { quizConfigsCache = null; };
export const clearResultsCache = () => { resultsCache.clear(); };

// --- QUESTIONS API ---

export interface QuestionFilters {
    search?: string;
    subject?: string;
    gradeLevel?: GradeLevel;
    type?: QuestionType;
    difficulty?: Difficulty;
    category?: QuestionCategory;
}

export const getQuestions = async (
    page: number = 1, 
    limit: number = 10, 
    filters: QuestionFilters = {}
): Promise<{ data: Question[]; total: number }> => {
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
    return { data: [], total: 0 };
  }
  
  const mapped = data.map(mapQuestionFromDB);
  return { data: mapped, total: count || 0 };
};

// Legacy support for getting all questions (if needed by other components, though we should migrate)
export const getAllQuestionsRaw = async (): Promise<Question[]> => {
    const { data, error } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return data.map(mapQuestionFromDB);
};

export const saveQuestion = async (question: Question): Promise<void> => {
  questionsCache = null; // Invalidate cache
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
  questionsCache = null; // Invalidate cache
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
  questionsCache = null; // Invalidate cache
  const { data } = await supabase.from('questions').select('is_disabled').eq('id', id).single();
  if (data) {
    await supabase.from('questions').update({ is_disabled: !data.is_disabled }).eq('id', id);
  }
};

export const deleteQuestion = async (id: string): Promise<void> => {
  questionsCache = null; // Invalidate cache
  // Soft delete
  const { error } = await supabase.from('questions').update({ is_deleted: true }).eq('id', id);
  if (error) console.error('Error deleting question:', error);
};

// --- CONFIGURATION API ---

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
  
  const mapped = (data || []).map(mapConfigFromDB);
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
  return mapConfigFromDB(data);
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

export const generateQuiz = async (configId: string): Promise<{ questions: Question[], configName: string, passingScore: number }> => {
    const { data: config } = await supabase.from('quiz_configs').select('*').eq('id', configId).single();
    
    if (!config) {
        return { questions: [], configName: 'Unknown', passingScore: 0 };
    }

    const mappedConfig = mapConfigFromDB(config);
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
            let mappedQuestions = questions.map(mapQuestionFromDB);
            
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

export const gradeQuiz = async (attempts: { questionId: string; userAnswer: string; maxScore: number }[]): Promise<{ attempts: any[]; score: number }> => {
    const questionIds = attempts.map(a => a.questionId);
    
    // Fetch original questions with correct answers from DB
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .in('id', questionIds);
  
    if (!questions) return { attempts: [], score: 0 };
  
    const mappedQuestions = questions.map(mapQuestionFromDB);
    
    const gradedAttempts = attempts.map(attempt => {
      const q = mappedQuestions.find(mq => mq.id === attempt.questionId);
      if (!q) {
          return { 
              ...attempt, 
              isCorrect: false, 
              score: 0, 
              correctAnswerText: 'Error loading question',
              explanation: ''
          };
      }
  
      let isCorrect = false;
      const userAnswer = attempt.userAnswer || '';
  
      // Grading Logic (Mirrors QuizTaker.tsx)
      if (q.type === QuestionType.SHORT_ANSWER && q.needsGrading) {
          isCorrect = false; // Mark as false/pending for manual grading
      } else if (q.type === QuestionType.MULTIPLE_SELECT) {
          try {
             const userArr = JSON.parse(userAnswer || '[]');
             const correctArr = JSON.parse(q.correctAnswer || '[]');
             userArr.sort();
             correctArr.sort();
             isCorrect = JSON.stringify(userArr) === JSON.stringify(correctArr);
          } catch {
              isCorrect = false;
          }
      } else if (q.type === QuestionType.MULTIPLE_CHOICE || q.type === QuestionType.TRUE_FALSE) {
          isCorrect = userAnswer === q.correctAnswer;
      } else if (q.type === QuestionType.FILL_IN_THE_BLANK) {
          let correctParts: string[] = [];
          let userParts: string[] = [];
          try {
              const parsed = JSON.parse(q.correctAnswer || '[]');
              if (Array.isArray(parsed)) correctParts = parsed;
              else correctParts = [q.correctAnswer || ''];
          } catch {
              if (q.correctAnswer?.includes(';&&;')) correctParts = q.correctAnswer.split(';&&;');
              else correctParts = [q.correctAnswer || ''];
          }
          try {
              const parsed = JSON.parse(userAnswer || '[]');
              if (Array.isArray(parsed)) userParts = parsed;
              else userParts = userAnswer ? [userAnswer] : [];
          } catch {
              userParts = userAnswer ? [userAnswer] : [];
          }
          
          if (userParts.length !== correctParts.length) {
              isCorrect = false;
          } else {
              isCorrect = correctParts.every((cPart, idx) => {
                  const uPart = userParts[idx] || '';
                  const cleanCorrect = cPart.replace(/<[^>]+>/g, '').trim().toLowerCase();
                  const cleanUser = uPart.trim().toLowerCase();
                  return cleanUser === cleanCorrect;
              });
          }
      } else {
          // Short Answer Auto-Grade
          const cleanCorrectAnswer = (q.correctAnswer || '').replace(/<[^>]+>/g, '').trim().toLowerCase();
          const cleanUserAnswer = userAnswer.trim().toLowerCase();
          isCorrect = cleanUserAnswer === cleanCorrectAnswer;
      }
  
      return {
         ...attempt,
         isCorrect,
         score: isCorrect ? attempt.maxScore : 0,
         correctAnswerText: q.correctAnswer, // Restore correct answer for review
         explanation: q.explanation
      };
    });
  
    const totalScore = gradedAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
    
    return { attempts: gradedAttempts, score: totalScore };
  };

// --- USER API ---

// Helper to generate safe email from username (handles Chinese characters)
const generateSafeEmail = (username: string): string => {
    // Use Hex encoding of UTF-8 bytes to ensure safe email local part
    const encoder = new TextEncoder();
    const data = encoder.encode(username);
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex}@quizmaster.com`;
};

export const registerUser = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
  // Check if registration is allowed
  const allowRegistration = await getSystemSetting('allow_registration');
  if (allowRegistration === 'false') {
      return { success: false, message: '当前系统禁止新用户注册' };
  }

  // Use safe email generation to support Chinese usernames
  const email = generateSafeEmail(username);
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, role: UserRole.USER }
    }
  });

  if (signUpError) return { success: false, message: signUpError.message };
  
  if (signUpData.user) {
      // Create profile entry
      const { error: profileError } = await supabase.from('profiles').insert({
          id: signUpData.user.id,
          username,
          role: UserRole.USER
      });
      if (profileError) {
          console.error('Profile creation failed:', profileError);
          // If profile creation fails with 23505 (Unique violation), it likely means 
          // a trigger already created the profile or the username exists.
          // Since auth.signUp succeeded, we should assume registration is successful 
          // but maybe log this specific case.
          if (profileError.code !== '23505') {
             // Only return error if it's NOT a unique violation (which we treat as "already handled")
             // However, strictly speaking, if it was a username collision with another user, 
             // signUp likely wouldn't have succeeded if emails map 1:1 to usernames.
          }
          // We continue to return success even if profile insert fails, 
          // assuming the auth user creation was the main goal and profile might exist.
      }
  }

  return { success: true, message: '注册成功' };
};

export const loginUser = async (username: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> => {
  // Try with safe email (Hex format) first - for new users and Chinese usernames
  let email = generateSafeEmail(username);
  
  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  // If failed, and username is ASCII, try legacy email format (backward compatibility)
  if (error && /^[\x00-\x7F]*$/.test(username)) {
      const legacyEmail = `${username}@quizmaster.com`;
      const { data: legacyData, error: legacyError } = await supabase.auth.signInWithPassword({
          email: legacyEmail,
          password
      });
      
      if (!legacyError && legacyData.user) {
          data = legacyData;
          error = legacyError;
      }
  }

  if (error || !data.user) {
      console.error('Login error details:', error);
      return { success: false, message: '登录失败：' + (error?.message || '未知错误') };
  }

  // Fetch Profile
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  
  if (!profile) {
      return { success: false, message: '用户档案不存在' };
  }

  // Check Active Status
  if (profile.is_active === false) { // Default to true if null/undefined
      await supabase.auth.signOut();
      return { success: false, message: '您的账户已被停用，请联系管理员开通' };
  }

  return {
      success: true,
      user: {
          id: profile.id,
          username: profile.username,
          role: profile.role as UserRole,
          createdAt: profile.created_at,
          isActive: profile.is_active
      }
  };
};

export const adminAddUser = async (username: string, password: string, role: UserRole): Promise<{ success: boolean; message: string }> => {
    // Call the RPC function admin_create_user to create user without logging out
    const { data, error } = await supabase.rpc('admin_create_user', {
        new_username: username,
        new_password: password,
        new_role: role
    });

    if (error) {
        console.error('Error creating user via admin RPC:', error);
        return { success: false, message: '创建失败: ' + error.message };
    }

    if (data.success) {
        return { success: true, message: '用户创建成功' };
    } else {
        return { success: false, message: data.message || '创建失败' };
    }
};

export const deleteUser = async (userId: string): Promise<{ success: boolean; error?: any }> => {
    // Only SUPER_ADMIN can perform this via RLS or RPC, but here we use simple delete on profiles
    // However, deleting from Auth is harder without Service Role. 
    // We can use RPC admin_delete_user
    
    const { data, error } = await supabase.rpc('admin_delete_user', { user_id: userId });
    
    if (error) {
        console.error('Error deleting user:', error);
        return { success: false, error };
    }
    
    if (data && data.success) {
        return { success: true };
    } else {
        return { success: false, error: { message: data?.message || '删除失败' } };
    }
};

export const updateUserRole = async (userId: string, newRole: UserRole): Promise<{ success: boolean; error?: any }> => {
    // We can update public.profiles directly if RLS allows (Admins can update)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    
    if (error) {
        return { success: false, error };
    }
    return { success: true };
};

export const updateUserProfile = async (userId: string, updates: any): Promise<{ success: boolean; error?: any }> => {
    // If password update is needed, we need RPC or Admin API.
    // For now handle non-password updates
    const { password, ...profileUpdates } = updates;
    
    // Update profile fields
    const { error } = await supabase.from('profiles').update({
        username: profileUpdates.username,
        role: profileUpdates.role,
        is_active: profileUpdates.isActive
    }).eq('id', userId);

    if (error) return { success: false, error };
    
    // Update password if provided
    if (password) {
        const { data, error: pwdError } = await supabase.rpc('admin_update_user_password', {
            target_user_id: userId,
            new_password: password
        });
        
        if (pwdError) return { success: false, error: pwdError };
        if (data && !data.success) return { success: false, error: { message: data.message } };
    }
    
    return { success: true };
};

export const getPaginatedUsers = async (page: number, limit: number): Promise<{ data: User[]; total: number }> => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    const { data, count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
        
    if (error) {
        console.error('Error fetching users:', error);
        return { data: [], total: 0 };
    }
    
    const mappedUsers: User[] = (data || []).map(p => ({
        id: p.id,
        username: p.username,
        role: p.role as UserRole,
        createdAt: p.created_at,
        isActive: p.is_active
    }));
    
    return { data: mappedUsers, total: count || 0 };
};

// --- SYSTEM SETTINGS API ---

export const getSystemSetting = async (key: string): Promise<string | null> => {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', key).single();
    if (error || !data) return null;
    return data.value;
};

export const updateSystemSetting = async (key: string, value: string): Promise<{ success: boolean; message: string }> => {
    const { error } = await supabase.from('system_settings').upsert({
        key,
        value,
        updated_at: Date.now()
    });
    
    if (error) {
        console.error('Error updating setting:', error);
        return { success: false, message: error.message };
    }
    return { success: true, message: '设置更新成功' };
};

// --- RESULTS HISTORY ---

export const checkUserStatus = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_deleted, is_active')
    .eq('id', userId)
    .single();

  // If there's an error (e.g. network issue), we assume the user is valid to prevent accidental logout
  // We only return false if we explicitly get data saying the user is deleted or inactive
  if (error) {
    console.warn('Error checking user status, assuming active:', error);
    return true; 
  }

  if (!data) {
      return false; // User not found, should logout
  }

  // User is valid if NOT deleted AND IS active
  return !data.is_deleted && (data.is_active !== false); // Default to true if null
};

export const saveQuizResult = async (result: QuizResult): Promise<void> => {
  // Check if user is still active before saving
  const isActive = await checkUserStatus(result.userId);
  if (!isActive) {
    throw new Error('User account is deactivated or deleted. Cannot save result.');
  }

  const { error } = await supabase.from('quiz_results').insert([{
    user_id: result.userId,
    username: result.username,
    score: result.score,
    max_score: result.maxScore,
    passing_score: result.passingScore,
    is_passed: result.isPassed,
    total_questions: result.totalQuestions,
    attempts: result.attempts,
    config_id: result.configId,
    config_name: result.configName,
    timestamp: result.timestamp,
    status: result.status || 'completed',
    duration: result.duration
  }]);

  if (error) {
    console.error('Error saving quiz result:', error);
    throw error;
  }
  
  // Invalidate cache
  resultsCache.clear();
};

export const deleteQuizResult = async (id: string): Promise<void> => {
    resultsCache.clear(); // Invalidate cache
    const { error } = await supabase.from('quiz_results').delete().eq('id', id);
    if (error) {
        console.error('Error deleting quiz result:', error);
        throw error;
    }
};

export const getUserResults = async (userId: string): Promise<QuizResult[]> => {
  const cacheKey = `user_all_${userId}`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return cached.data;
      }
  }

  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) return [];
  const mapped = data.map(mapResultFromDB);
  resultsCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
  return mapped;
};

export const getPaginatedUserResultsByUserId = async (
  userId: string,
  page: number,
  limit: number
): Promise<{ data: QuizResult[]; total: number }> => {
  const cacheKey = `user_paginated_${userId}_${page}_${limit}`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return { data: cached.data, total: cached.total || 0 };
      }
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('quiz_results')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching user results:', error);
    return { data: [], total: 0 };
  }

  const mapped = (data || []).map(mapResultFromDB);
  const total = count || 0;
  
  resultsCache.set(cacheKey, { data: mapped, total, timestamp: Date.now() });

  return {
    data: mapped,
    total
  };
};

export const getAllUserResults = async (): Promise<QuizResult[]> => {
  const cacheKey = `all_results`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return cached.data;
      }
  }

  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) return [];
  const mapped = data.map(mapResultFromDB);
  resultsCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
  return mapped;
};

export const getPaginatedUserResults = async (
  page: number, 
  limit: number, 
  searchTerm?: string
): Promise<{ data: QuizResult[]; total: number }> => {
  const cacheKey = `paginated_results_${page}_${limit}_${searchTerm || ''}`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return { data: cached.data, total: cached.total || 0 };
      }
  }

  let query = supabase
    .from('quiz_results')
    .select('*', { count: 'exact' })
    .order('timestamp', { ascending: false });

  if (searchTerm) {
    query = query.ilike('username', `%${searchTerm}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error('Error fetching paginated results:', error);
    return { data: [], total: 0 };
  }

  const mapped = (data || []).map(mapResultFromDB);
  const total = count || 0;
  
  resultsCache.set(cacheKey, { data: mapped, total, timestamp: Date.now() });

  return {
    data: mapped,
    total
  };
};

export const gradeQuizResult = async (resultId: string, attempts: any[], finalScore: number, isPassed: boolean): Promise<void> => {
  resultsCache.clear(); // Invalidate results cache
  const { error } = await supabase
    .from('quiz_results')
    .update({
      attempts: attempts,
      score: finalScore,
      is_passed: isPassed,
      status: 'completed'
    })
    .eq('id', resultId);

  if (error) console.error('Error grading result:', error);
};
